import { describe, expect, it } from "vitest";
import {
  describeAdminUpdate,
  formatAdminLoginFailBurstSummary,
  formatAlertRulePatch,
  formatAlertToggleSummary,
  formatMigrationSummary,
  formatMigrationTarget,
  formatPointsRulesChange,
  formatPurgeSummary,
  formatQuotaChange,
  hasQuotaChange,
  shouldNotifyAdminLoginFailBurst,
  tailId,
} from "../../../src/utils/adminMpNotifyFormat";

describe("unit: adminMpNotifyFormat", () => {
  it("tailId 返回尾号", () => {
    expect(tailId("oued_3L2LX-sBlvaqgJIh9zOtOGA")).toBe("…zOtOGA");
  });

  it("formatMigrationTarget 长度不超过 20", () => {
    const value = formatMigrationTarget(
      "oued_3L2LX-sBlvaqgJIh9zOtOGA",
      "oued_9A8B7C6D5E4F3G2H1I0J",
    );
    expect(value.length).toBeLessThanOrEqual(20);
    expect(value).toContain("源→目标");
  });

  it("formatMigrationSummary 幂等命中", () => {
    expect(formatMigrationSummary("mig_abc", "success", true)).toBe("幂等命中已成功");
  });

  it("formatPurgeSummary 区分 dryRun 与 withCos", () => {
    expect(formatPurgeSummary({ dryRun: true, withCos: true })).toBe("预检 dryRun");
    expect(formatPurgeSummary({ dryRun: false, withCos: true })).toBe("正式删 withCos");
    expect(formatPurgeSummary({ dryRun: false, withCos: false })).toBe("正式删 无COS");
  });

  it("describeAdminUpdate 按字段推断操作类型", () => {
    expect(describeAdminUpdate({ password: "newpass" })).toBe("管理员改密");
    expect(describeAdminUpdate({ allowedPages: ["notes"] })).toBe("管理员改权限");
    expect(describeAdminUpdate({ disabled: true })).toBe("禁用管理员");
  });

  it("formatQuotaChange 仅输出变更字段", () => {
    const summary = formatQuotaChange(
      { uploadDailyBaseLimit: 5, aiDailyBaseLimit: 10 },
      { uploadDailyBaseLimit: 8, aiDailyBaseLimit: 20 },
    );
    expect(summary.length).toBeLessThanOrEqual(20);
    expect(summary).toContain("AI 10→20");
    expect(summary).toContain("上传5→8");
  });

  it("hasQuotaChange 无变更返回 false", () => {
    const limits = { uploadDailyBaseLimit: 5, aiDailyBaseLimit: 10 };
    expect(hasQuotaChange(limits, { ...limits })).toBe(false);
  });

  it("formatPointsRulesChange 输出广告分变更", () => {
    const prev = {
      pointsPerAd: 5,
      globalAdDailyLimit: 6,
      uploadExchange: { enabled: true, pointsCost: 10, quotaGain: 1 },
      aiExchange: { enabled: true, pointsCost: 50, quotaGain: 1 },
      feedbackRewards: { weeklyFirstSubmit: 1, important: 2, critical: 3 },
    };
    const next = { ...prev, pointsPerAd: 10 };
    const summary = formatPointsRulesChange(prev, next);
    expect(summary.length).toBeLessThanOrEqual(20);
    expect(summary).toContain("广告分5→10");
  });

  it("formatAlertToggleSummary", () => {
    expect(formatAlertToggleSummary(true)).toBe("已启用");
    expect(formatAlertToggleSummary(false)).toBe("已禁用");
  });

  it("formatAlertRulePatch 输出阈值变更", () => {
    const summary = formatAlertRulePatch(
      {
        thresholdValue: 0.2,
        enabled: true,
        severity: "P2",
        recoverValue: 0.15,
        windowMinutes: 5,
      } as never,
      { thresholdValue: 0.3 },
    );
    expect(summary).toContain("阈值0.2→0.3");
    expect(summary.length).toBeLessThanOrEqual(20);
  });

  it("shouldNotifyAdminLoginFailBurst 仅在达阈值或冷却到期时返回 true", () => {
    const base = {
      threshold: 5,
      lastNotifyAt: null as number | null,
      now: 1_000_000,
      cooldownMs: 5 * 60 * 1000,
    };
    expect(
      shouldNotifyAdminLoginFailBurst({ ...base, failCount: 4 }),
    ).toBe(false);
    expect(
      shouldNotifyAdminLoginFailBurst({ ...base, failCount: 5 }),
    ).toBe(true);
    expect(
      shouldNotifyAdminLoginFailBurst({
        ...base,
        failCount: 8,
        lastNotifyAt: 900_000,
      }),
    ).toBe(false);
    expect(
      shouldNotifyAdminLoginFailBurst({
        ...base,
        failCount: 8,
        lastNotifyAt: 100_000,
      }),
    ).toBe(true);
  });

  it("formatAdminLoginFailBurstSummary", () => {
    expect(formatAdminLoginFailBurstSummary(5, 5)).toBe("5分钟失败5次");
  });
});
