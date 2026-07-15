import { describe, expect, it } from "vitest";
import {
  defaultHighRiskRemark,
  describeAdminUpdate,
  describeAdminUpdateSummary,
  formatAdminLoginFailBurstSummary,
  formatAlertRulePatch,
  formatAlertToggleSummary,
  formatMigrationSummary,
  formatMigrationTarget,
  formatPointsRulesChange,
  formatPurgeSummary,
  formatQuotaChange,
  hasAlertRulePatchChange,
  hasPointsRulesChange,
  hasQuotaChange,
  shouldNotifyAdminLoginFailBurst,
  tailId,
} from "../../../src/utils/adminMpNotifyFormat";

describe("unit: adminMpNotifyFormat", () => {
  it("id / migration / purge / admin update 文案", () => {
    expect(tailId("")).toBe("unknown");
    expect(tailId("abc")).toBe("abc");
    expect(tailId("abcdefghijk", 4)).toContain("…");
    expect(formatMigrationTarget("src-openid-1", "tgt-openid-2")).toContain("源→目标");
    expect(formatMigrationSummary("task_very_long_id", "success", true)).toBe(
      "幂等命中已成功",
    );
    expect(formatMigrationSummary("short", "failed")).toContain("failed");
    expect(formatPurgeSummary({ dryRun: true, withCos: false })).toContain("dryRun");
    expect(formatPurgeSummary({ dryRun: false, withCos: true })).toContain("withCos");
    expect(formatPurgeSummary({ dryRun: false, withCos: false })).toContain("无COS");
    expect(describeAdminUpdate({ disabled: true })).toBe("禁用管理员");
    expect(describeAdminUpdate({ disabled: false })).toBe("启用管理员");
    expect(describeAdminUpdate({ password: "x" })).toBe("管理员改密");
    expect(describeAdminUpdate({ allowedPages: ["a"] })).toBe("管理员改权限");
    expect(describeAdminUpdate({})).toBe("管理员更新");
    expect(describeAdminUpdateSummary({ disabled: true })).toContain("disabled");
    expect(describeAdminUpdateSummary({ allowedPages: ["a", "b"] })).toContain(
      "pages",
    );
  });

  it("points rules / alert / truncate edge", () => {
    const prev = {
      pointsPerAd: 1,
      globalAdDailyLimit: 10,
      uploadExchange: { enabled: true, cost: 1, amount: 1 },
      aiExchange: { enabled: false, cost: 1, amount: 1 },
    } as never;
    const next = {
      pointsPerAd: 2,
      globalAdDailyLimit: 20,
      uploadExchange: { enabled: false, cost: 1, amount: 1 },
      aiExchange: { enabled: true, cost: 1, amount: 1 },
    } as never;
    expect(hasPointsRulesChange(prev, next)).toBe(true);
    expect(hasPointsRulesChange(prev, prev)).toBe(false);
    expect(formatPointsRulesChange(prev, next)).toBeTruthy();
    expect(formatAlertToggleSummary(true)).toBe("已启用");
    expect(formatAlertToggleSummary(false)).toBe("已禁用");
    expect(
      formatQuotaChange(
        { uploadDailyBaseLimit: 1, aiDailyBaseLimit: 1 },
        { uploadDailyBaseLimit: 1, aiDailyBaseLimit: 1 },
      ),
    ).toContain("无变更");
    expect(describeAdminUpdateSummary({ disabled: false })).toContain("false");
    expect(describeAdminUpdateSummary({ password: "x" })).toContain("密码");
    expect(describeAdminUpdateSummary({})).toBe("已更新");
    expect(formatMigrationSummary("shortid", undefined, false)).toContain("已提交");
    expect(tailId("abcdef", 10)).toBe("abcdef");
    expect(formatAlertRulePatch(null, { enabled: true })).toBeTruthy();
    expect(hasAlertRulePatchChange(null, { enabled: true })).toBe(true);
    expect(defaultHighRiskRemark("用户迁徙")).toBeTruthy();
    expect(
      shouldNotifyAdminLoginFailBurst({ failCount: 10, windowMinutes: 10, threshold: 5 }),
    ).toBe(true);
    expect(
      shouldNotifyAdminLoginFailBurst({ failCount: 1, windowMinutes: 10, threshold: 5 }),
    ).toBe(false);
    expect(formatAdminLoginFailBurstSummary(8, 15)).toBeTruthy();
  });
});
