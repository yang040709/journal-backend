import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import AlertRule from "../../../src/model/AlertRule";
import AlertEvent from "../../../src/model/AlertEvent";
import { AlertEngineService } from "../../../src/service/alertEngine.service";
import { AlertMetricService } from "../../../src/service/alertMetric.service";
import { AlertNotifyService } from "../../../src/service/alertNotify.service";

vi.mock("../../../src/service/alertNotify.service", () => ({
  AlertNotifyService: {
    notifyNewEvent: vi.fn(),
  },
}));

describe("unit: AlertEngineService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(AlertNotifyService.notifyNewEvent).mockReset();
  });

  async function seedRule(
    ruleKey: string,
    overrides: Record<string, unknown> = {},
  ) {
    return AlertRule.create({
      ruleKey,
      name: ruleKey,
      description: "t",
      severity: "P1",
      enabled: true,
      windowMinutes: 5,
      minSampleCount: 1,
      thresholdType: "rate",
      thresholdValue: 0.1,
      recoverValue: 0.05,
      consecutiveHits: 1,
      cooldownMinutes: 0,
      notifyChannels: ["in_app"],
      params: {},
      stats: { hitStreak: 0, recoverStreak: 0 },
      ...overrides,
    });
  }

  it("登录失败率触发新告警；未匹配规则记未突破", async () => {
    await seedRule("auth_login_abnormal", {
      params: { secondaryFailCountThreshold: 2 },
      thresholdValue: 0.5,
      minSampleCount: 10,
    });
    await seedRule("unknown_rule_key");

    vi.spyOn(AlertMetricService, "aggregateMetricWindow").mockImplementation(
      async (metric) => {
        if (metric === "login_auth") {
          return { totalCount: 10, failCount: 8, successCount: 2 };
        }
        return { totalCount: 0, failCount: 0, successCount: 0 };
      },
    );

    await AlertEngineService.evaluateAllRules();

    const events = await AlertEvent.find({ ruleKey: "auth_login_abnormal" });
    expect(events.length).toBe(1);
    expect(AlertNotifyService.notifyNewEvent).toHaveBeenCalled();
    const unknown = await AlertRule.findOne({ ruleKey: "unknown_rule_key" });
    expect(unknown?.stats?.lastValue).toBe(0);
  });

  it("migration_failed / cos / export / risk 评估分支可运行", async () => {
    await seedRule("migration_failed", {
      thresholdType: "count",
      thresholdValue: 1,
      params: { rollbackFailedImmediateThreshold: 1 },
    });
    await seedRule("cos_failure_rate_rise", {
      params: { secondaryInternalFailThreshold: 1 },
      minSampleCount: 1,
      thresholdValue: 0.5,
    });
    await seedRule("export_spike", {
      thresholdType: "ratio_vs_baseline",
      thresholdValue: 2,
      params: { minTotalThreshold: 1, secondaryFailCountThreshold: 99 },
    });
    await seedRule("risk_reject_rate_spike", {
      minSampleCount: 1,
      thresholdValue: 0.2,
      params: { baselineRatioThreshold: 2 },
    });

    vi.spyOn(AlertMetricService, "getMigrationWindowStats").mockResolvedValue({
      failedCount: 0,
      rollbackFailedCount: 1,
    } as any);
    vi.spyOn(AlertMetricService, "aggregateMetricWindow").mockResolvedValue({
      totalCount: 10,
      failCount: 6,
      successCount: 4,
    } as any);
    vi.spyOn(AlertMetricService, "getExportWindowStats").mockResolvedValue({
      totalCount: 10,
      failCount: 0,
    } as any);
    vi.spyOn(AlertMetricService, "getExportBaselineTotal").mockResolvedValue(2);
    vi.spyOn(AlertMetricService, "getRiskWindowStats").mockResolvedValue({
      checkedCount: 10,
      rejectRate: 0.5,
    } as any);
    vi.spyOn(AlertMetricService, "getRiskBaselineRejectRate").mockResolvedValue(
      0.1,
    );

    await AlertEngineService.evaluateAllRules();
    const count = await AlertEvent.countDocuments({});
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
