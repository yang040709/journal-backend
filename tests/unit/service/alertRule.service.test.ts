import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { AlertRuleService } from "../../../src/service/alertRule.service";

describe("unit: AlertRuleService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("ensureDefault / list / update / toggle", async () => {
    const seeds = AlertRuleService.getDefaultRuleSeeds();
    expect(seeds.length).toBeGreaterThanOrEqual(5);

    const rules = await AlertRuleService.listRules();
    expect(rules.length).toBe(seeds.length);

    const one = await AlertRuleService.getRuleByKey("migration_failed");
    expect(one?.ruleKey).toBe("migration_failed");

    const updated = await AlertRuleService.updateRuleByKey("migration_failed", {
      enabled: false,
      severity: "P2",
      windowMinutes: 15,
      minSampleCount: 2,
      thresholdType: "count",
      thresholdValue: 3,
      recoverValue: 1,
      consecutiveHits: 2,
      cooldownMinutes: 8,
      name: "迁徙失败改",
      description: "desc",
      params: { rollbackFailedImmediateThreshold: 2 },
    });
    expect(updated?.enabled).toBe(false);
    expect(updated?.name).toBe("迁徙失败改");
    expect(await AlertRuleService.updateRuleByKey("", { enabled: true })).toBeNull();
    expect(
      (await AlertRuleService.updateRuleByKey("migration_failed", {}))?.ruleKey,
    ).toBe("migration_failed");

    const toggled = await AlertRuleService.toggleRule("migration_failed", true);
    expect(toggled?.enabled).toBe(true);
  });
});
