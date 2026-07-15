import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import NoteExportLog from "../../../src/model/NoteExportLog";
import ShareSecurityTask from "../../../src/model/ShareSecurityTask";
import UserMigrationTask from "../../../src/model/UserMigrationTask";
import { AlertMetricService } from "../../../src/service/alertMetric.service";

describe("unit: AlertMetricService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("record / aggregate / migration / risk / export 窗口统计", async () => {
    await AlertMetricService.recordOperation("", { success: true });
    await AlertMetricService.recordOperation("login_auth", {
      success: true,
      count: 2,
      tags: { src: "ut" },
    });
    await AlertMetricService.recordOperation("login_auth", {
      success: false,
      count: 1,
    });
    await AlertMetricService.recordOperation("export_run", {
      success: false,
      count: 3,
    });

    const empty = await AlertMetricService.aggregateMetricWindow("", 5);
    expect(empty.totalCount).toBe(0);
    const agg = await AlertMetricService.aggregateMetricWindow("login_auth", 10);
    expect(agg.totalCount).toBe(3);
    expect(agg.failCount).toBe(1);

    await UserMigrationTask.create({
      taskId: "mig_1",
      sourceOpenid: "s",
      targetOpenid: "t",
      operator: "op",
      remark: "r",
      idempotencyKey: "k1",
      status: "failed",
    });
    await UserMigrationTask.create({
      taskId: "mig_2",
      sourceOpenid: "s2",
      targetOpenid: "t2",
      operator: "op",
      remark: "r",
      idempotencyKey: "k2",
      status: "rollback_failed",
    });
    const mig = await AlertMetricService.getMigrationWindowStats(60);
    expect(mig.failedCount).toBe(1);
    expect(mig.rollbackFailedCount).toBe(1);

    const snap = {
      title: "t",
      content: "c",
      tags: [],
      images: [],
      riskMeta: { source: "local" as const },
    };
    await ShareSecurityTask.create({
      taskId: "sst-1",
      noteId: "n1",
      userId: "u1",
      shareVersion: 1,
      scene: "share_enable",
      source: "local",
      status: "reject_local",
      imageCount: 0,
      snapshot: snap,
    });
    await ShareSecurityTask.create({
      taskId: "sst-2",
      noteId: "n2",
      userId: "u1",
      shareVersion: 1,
      scene: "share_enable",
      source: "local",
      status: "pass",
      imageCount: 0,
      snapshot: snap,
    });

    const risk = await AlertMetricService.getRiskWindowStats(60);
    expect(risk.checkedCount).toBe(2);
    expect(risk.rejectCount).toBe(1);
    const baseline = await AlertMetricService.getRiskBaselineRejectRate(60, 3);
    expect(baseline).toBeGreaterThanOrEqual(0);

    await NoteExportLog.create({
      userId: "u1",
      noteBookId: "b1",
      noteBookTitle: "本",
      rangeStart: new Date(Date.now() - 1000),
      rangeEnd: new Date(),
      sort: "updatedAt",
      totalInRange: 1,
      noteCount: 1,
      source: "weekly_free",
    });
    const exportWin = await AlertMetricService.getExportWindowStats(60);
    expect(exportWin.totalCount).toBeGreaterThanOrEqual(1);
    const exportBase = await AlertMetricService.getExportBaselineTotal(60, 3);
    expect(exportBase).toBeGreaterThanOrEqual(0);
  });
});
