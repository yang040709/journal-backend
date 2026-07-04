import STS from "qcloud-cos-sts";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  UploadService,
  UploadDailyLimitExceededError,
} from "../../../src/service/upload.service";
import UserUploadQuotaDaily from "../../../src/model/UserUploadQuotaDaily";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { getQuotaDateContext } from "../../../src/utils/dateKey";

vi.mock("qcloud-cos-sts", () => ({
  default: {
    getCredential: vi.fn(),
  },
}));

describe("contract: UploadService COS boundary", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(STS.getCredential).mockReset();
  });

  it("参数校验失败时不扣减上传额度", async () => {
    const { userId } = await seedUser();
    const { dateKey } = getQuotaDateContext();

    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "note",
        fileName: "photo.jpg",
        fileType: "image/jpeg",
        fileSize: 10 * 1024 * 1024,
      }),
    ).rejects.toThrow(/文件大小超过限制/);

    const doc = await UserUploadQuotaDaily.findOne({ userId, dateKey }).lean();
    expect(doc?.usedCount ?? 0).toBe(0);
    expect(STS.getCredential).not.toHaveBeenCalled();
  });

  it("STS 失败时不调用外网且抛出错误", async () => {
    const { userId } = await seedUser();
    vi.mocked(STS.getCredential).mockRejectedValue(new Error("STS mock failed"));

    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "note",
        fileName: "photo.jpg",
        fileType: "image/jpeg",
        fileSize: 1024,
      }),
    ).rejects.toThrow("STS mock failed");

    expect(STS.getCredential).toHaveBeenCalledOnce();
  });

  it("额度耗尽时抛出 UploadDailyLimitExceededError", async () => {
    const { userId } = await seedUser();
    const { dateKey } = getQuotaDateContext();
    await UserUploadQuotaDaily.create({
      userId,
      dateKey,
      usedCount: 9,
      baseLimit: 9,
      extraQuota: 0,
      bizBreakdown: { note: 9, cover: 0, avatar: 0 },
    });

    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "note",
        fileName: "photo.jpg",
        fileType: "image/jpeg",
        fileSize: 1024,
      }),
    ).rejects.toBeInstanceOf(UploadDailyLimitExceededError);

    expect(STS.getCredential).not.toHaveBeenCalled();
  });
});
