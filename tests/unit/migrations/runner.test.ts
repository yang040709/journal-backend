import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import SchemaMigrationRun from "../../../src/model/SchemaMigrationRun";
import {
  claimSchemaMigration,
  runPendingMigrations,
  SCHEMA_MIGRATION_MAX_ATTEMPTS,
  SCHEMA_MIGRATION_STUCK_MS,
} from "../../../src/migrations/runner";
import type { SchemaMigration } from "../../../src/migrations/types";
import { clearTestDb, connectTestDb } from "../../helpers/db";

describe("unit: schema migration runner", () => {
  beforeAll(async () => {
    await connectTestDb();
    await SchemaMigrationRun.syncIndexes();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    delete process.env.SCHEMA_MIGRATIONS_DISABLED;
  });

  it("已 success 不再调用 run", async () => {
    const run = vi.fn(async () => ({ modified: 1 }));
    const migrations: SchemaMigration[] = [
      { name: "t-success", version: 1, run },
    ];

    await SchemaMigrationRun.create({
      name: "t-success",
      version: 1,
      status: "success",
      attemptCount: 1,
      finishedAt: new Date(),
    });

    await runPendingMigrations({ migrations });
    expect(run).not.toHaveBeenCalled();
  });

  it("并发抢锁：仅一方 claim 成功", async () => {
    const [a, b] = await Promise.all([
      claimSchemaMigration("t-claim", 1),
      claimSchemaMigration("t-claim", 1),
    ]);

    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);
    const docs = await SchemaMigrationRun.find({
      name: "t-claim",
      version: 1,
    }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe("running");
    expect(docs[0].attemptCount).toBe(1);
  });

  it("failed 未超 max 可再跑；超 max 不再跑", async () => {
    const run = vi.fn(async () => {
      throw new Error("boom");
    });
    const migrations: SchemaMigration[] = [
      { name: "t-fail", version: 1, run },
    ];

    await runPendingMigrations({ migrations });
    expect(run).toHaveBeenCalledTimes(1);
    let doc = await SchemaMigrationRun.findOne({
      name: "t-fail",
      version: 1,
    }).lean();
    expect(doc?.status).toBe("failed");
    expect(doc?.attemptCount).toBe(1);

    await runPendingMigrations({ migrations });
    expect(run).toHaveBeenCalledTimes(2);
    doc = await SchemaMigrationRun.findOne({
      name: "t-fail",
      version: 1,
    }).lean();
    expect(doc?.attemptCount).toBe(2);

    // 再失败到 max
    await runPendingMigrations({ migrations });
    expect(run).toHaveBeenCalledTimes(SCHEMA_MIGRATION_MAX_ATTEMPTS);
    doc = await SchemaMigrationRun.findOne({
      name: "t-fail",
      version: 1,
    }).lean();
    expect(doc?.attemptCount).toBe(SCHEMA_MIGRATION_MAX_ATTEMPTS);
    expect(doc?.status).toBe("failed");

    await runPendingMigrations({ migrations });
    expect(run).toHaveBeenCalledTimes(SCHEMA_MIGRATION_MAX_ATTEMPTS);
  });

  it("dryRun 不写账本", async () => {
    const run = vi.fn(async () => ({ scanned: 3, modified: 1 }));
    const migrations: SchemaMigration[] = [
      { name: "t-dry", version: 1, run },
    ];

    await runPendingMigrations({ migrations, dryRun: true });
    expect(run).toHaveBeenCalledTimes(1);
    const docs = await SchemaMigrationRun.find({ name: "t-dry" }).lean();
    expect(docs).toHaveLength(0);
  });

  it("SCHEMA_MIGRATIONS_DISABLED 跳过全部", async () => {
    process.env.SCHEMA_MIGRATIONS_DISABLED = "1";
    const run = vi.fn(async () => ({ modified: 1 }));
    await runPendingMigrations({
      migrations: [{ name: "t-off", version: 1, run }],
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("卡住的 running 可被回收重跑", async () => {
    const run = vi.fn(async () => ({ modified: 0 }));
    const stuckAt = new Date(Date.now() - SCHEMA_MIGRATION_STUCK_MS - 1000);
    await SchemaMigrationRun.create({
      name: "t-stuck",
      version: 1,
      status: "running",
      attemptCount: 1,
      startedAt: stuckAt,
      lockedAt: stuckAt,
    });

    await runPendingMigrations({
      migrations: [{ name: "t-stuck", version: 1, run }],
    });

    expect(run).toHaveBeenCalledTimes(1);
    const doc = await SchemaMigrationRun.findOne({
      name: "t-stuck",
      version: 1,
    }).lean();
    expect(doc?.status).toBe("success");
    expect(doc?.attemptCount).toBe(2);
  });

  it("成功执行写入 success + meta", async () => {
    const run = vi.fn(async () => ({
      scanned: 10,
      modified: 2,
      message: "ok",
    }));

    await runPendingMigrations({
      migrations: [{ name: "t-ok", version: 1, run }],
    });

    const doc = await SchemaMigrationRun.findOne({
      name: "t-ok",
      version: 1,
    }).lean();
    expect(doc?.status).toBe("success");
    expect(doc?.meta?.scanned).toBe(10);
    expect(doc?.meta?.modified).toBe(2);
    expect(doc?.meta?.message).toBe("ok");
  });
});
