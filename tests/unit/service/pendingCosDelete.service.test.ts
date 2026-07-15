import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  enqueueCosDeletes,
  processPendingCosDeletes,
  COS_DELETE_STUCK_MS,
} from "../../../src/service/pendingCosDelete.service";
import PendingCosDelete from "../../../src/model/PendingCosDelete";
import { clearTestDb, connectTestDb } from "../../helpers/db";

vi.mock("../../../src/utils/cosDelete", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/utils/cosDelete")>();
  return {
    ...actual,
    deleteCosObjects: vi.fn(),
  };
});

import { deleteCosObjects } from "../../../src/utils/cosDelete";

const USER = "user_cos_delete_test";
const PREFIX = `journal/${USER}`;

describe("unit: pendingCosDelete.service", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(deleteCosObjects).mockReset();
    vi.mocked(deleteCosObjects).mockResolvedValue({ deletedKeys: 1 });
    process.env.COS_UPLOAD_DIR = "journal";
  });

  it("enqueue 过滤 cover: 伪 key 与非路径字符串", async () => {
    const n = await enqueueCosDeletes(
      [`${PREFIX}/a.png`, "cover:abc123", "nopath", `${PREFIX}/b.png`],
      { userId: USER, source: "test" },
    );
    expect(n).toBe(2);

    const docs = await PendingCosDelete.find().lean();
    expect(docs).toHaveLength(2);
    expect(docs.every((d) => !String(d.cosKey).startsWith("cover:"))).toBe(true);
  });

  it("enqueue 带 userId 时过滤非本人前缀", async () => {
    const n = await enqueueCosDeletes(
      [`${PREFIX}/mine.png`, "journal/other_user/x.png"],
      { userId: USER, source: "test" },
    );
    expect(n).toBe(1);
    const docs = await PendingCosDelete.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].cosKey).toBe(`${PREFIX}/mine.png`);
  });

  it("双 worker 认领互斥：同一文档不会被两边都认领成功", async () => {
    await PendingCosDelete.create({
      cosKey: `${PREFIX}/one.png`,
      userId: USER,
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
    });

    const [r1, r2] = await Promise.all([
      processPendingCosDeletes(10),
      processPendingCosDeletes(10),
    ]);

    const totalSucceeded = r1.succeeded + r2.succeeded;
    const totalProcessed = r1.processed + r2.processed;
    expect(totalSucceeded).toBe(1);
    expect(totalProcessed).toBe(1);

    const doc = await PendingCosDelete.findOne({ cosKey: `${PREFIX}/one.png` }).lean();
    expect(doc?.status).toBe("done");
    expect(deleteCosObjects).toHaveBeenCalledTimes(1);
  });

  it("按 key 成败：部分失败时成功的标 done，失败的回 pending", async () => {
    const keys = [
      `${PREFIX}/ok1.png`,
      `${PREFIX}/fail.png`,
      `${PREFIX}/ok2.png`,
    ];
    await enqueueCosDeletes(keys, { userId: USER, source: "test" });

    vi.mocked(deleteCosObjects).mockImplementation(async (batch) => {
      if (batch[0]?.includes("fail")) {
        throw new Error("mock delete fail");
      }
      return { deletedKeys: 1 };
    });

    const result = await processPendingCosDeletes(10);
    expect(result.processed).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);

    const ok1 = await PendingCosDelete.findOne({ cosKey: keys[0] }).lean();
    const fail = await PendingCosDelete.findOne({ cosKey: keys[1] }).lean();
    const ok2 = await PendingCosDelete.findOne({ cosKey: keys[2] }).lean();
    expect(ok1?.status).toBe("done");
    expect(ok2?.status).toBe("done");
    expect(fail?.status).toBe("pending");
    expect(fail?.attempts).toBe(1);
  });

  it("超时 processing 可被回收再处理", async () => {
    const cosKey = `${PREFIX}/stuck.png`;
    const stale = new Date(Date.now() - COS_DELETE_STUCK_MS - 1000);
    await PendingCosDelete.create({
      cosKey,
      userId: USER,
      status: "processing",
      lockedAt: stale,
      attempts: 0,
      maxAttempts: 5,
    });

    const result = await processPendingCosDeletes(10);
    expect(result.succeeded).toBe(1);
    const doc = await PendingCosDelete.findOne({ cosKey }).lean();
    expect(doc?.status).toBe("done");
  });

  it("无 lockedAt 的遗留 processing 可被回收", async () => {
    const cosKey = `${PREFIX}/legacy.png`;
    await PendingCosDelete.create({
      cosKey,
      userId: USER,
      status: "processing",
      attempts: 0,
      maxAttempts: 5,
    });

    const result = await processPendingCosDeletes(10);
    expect(result.succeeded).toBe(1);
  });

  it("未超时的 processing 不被回收认领", async () => {
    const cosKey = `${PREFIX}/inflight.png`;
    await PendingCosDelete.create({
      cosKey,
      userId: USER,
      status: "processing",
      lockedAt: new Date(),
      attempts: 0,
      maxAttempts: 5,
    });

    const result = await processPendingCosDeletes(10);
    expect(result.processed).toBe(0);
    const doc = await PendingCosDelete.findOne({ cosKey }).lean();
    expect(doc?.status).toBe("processing");
    expect(deleteCosObjects).not.toHaveBeenCalled();
  });
});
