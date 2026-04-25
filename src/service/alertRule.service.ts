import AlertRule, { IAlertRule } from "../model/AlertRule";

export type AlertRuleKey =
  | "auth_login_abnormal"
  | "export_spike"
  | "migration_failed"
  | "risk_reject_rate_spike"
  | "cos_failure_rate_rise";

type DefaultRuleSeed = {
  ruleKey: AlertRuleKey;
  name: string;
  description: string;
  severity: "P1" | "P2" | "P3";
  windowMinutes: number;
  minSampleCount: number;
  thresholdType: "count" | "rate" | "ratio_vs_baseline";
  thresholdValue: number;
  recoverValue: number;
  consecutiveHits: number;
  cooldownMinutes: number;
  params?: Record<string, unknown>;
};

const DEFAULT_RULES: DefaultRuleSeed[] = [
  {
    ruleKey: "auth_login_abnormal",
    name: "登录异常",
    description: "登录失败率过高或失败次数突增",
    severity: "P1",
    windowMinutes: 5,
    minSampleCount: 30,
    thresholdType: "rate",
    thresholdValue: 0.2,
    recoverValue: 0.12,
    consecutiveHits: 2,
    cooldownMinutes: 10,
    params: { secondaryFailCountThreshold: 20 },
  },
  {
    ruleKey: "export_spike",
    name: "导出激增",
    description: "导出请求总量相较基线异常放大",
    severity: "P2",
    windowMinutes: 10,
    minSampleCount: 1,
    thresholdType: "ratio_vs_baseline",
    thresholdValue: 3,
    recoverValue: 1.5,
    consecutiveHits: 1,
    cooldownMinutes: 20,
    params: { minTotalThreshold: 80, secondaryFailCountThreshold: 15 },
  },
  {
    ruleKey: "migration_failed",
    name: "迁徙失败",
    description: "用户迁徙任务失败或回滚失败",
    severity: "P1",
    windowMinutes: 30,
    minSampleCount: 1,
    thresholdType: "count",
    thresholdValue: 2,
    recoverValue: 0,
    consecutiveHits: 1,
    cooldownMinutes: 5,
    params: { rollbackFailedImmediateThreshold: 1 },
  },
  {
    ruleKey: "risk_reject_rate_spike",
    name: "风控拒绝率突增",
    description: "分享风控拒绝率相较基线显著上升",
    severity: "P1",
    windowMinutes: 15,
    minSampleCount: 30,
    thresholdType: "rate",
    thresholdValue: 0.35,
    recoverValue: 0.2,
    consecutiveHits: 2,
    cooldownMinutes: 15,
    params: { baselineRatioThreshold: 2 },
  },
  {
    ruleKey: "cos_failure_rate_rise",
    name: "COS失败率上升",
    description: "COS STS失败率或内部错误次数异常",
    severity: "P1",
    windowMinutes: 5,
    minSampleCount: 50,
    thresholdType: "rate",
    thresholdValue: 0.15,
    recoverValue: 0.08,
    consecutiveHits: 2,
    cooldownMinutes: 10,
    params: { secondaryInternalFailThreshold: 10 },
  },
];

export class AlertRuleService {
  static getDefaultRuleSeeds(): DefaultRuleSeed[] {
    return DEFAULT_RULES;
  }

  static async ensureDefaultRules(): Promise<void> {
    for (const seed of DEFAULT_RULES) {
      await AlertRule.updateOne(
        { ruleKey: seed.ruleKey },
        {
          $setOnInsert: {
            ...seed,
            enabled: true,
            notifyChannels: ["in_app"],
            stats: {
              hitStreak: 0,
              recoverStreak: 0,
            },
          },
        },
        { upsert: true },
      );
    }
  }

  static async listRules(): Promise<IAlertRule[]> {
    await AlertRuleService.ensureDefaultRules();
    return AlertRule.find({}).sort({ severity: 1, ruleKey: 1 });
  }

  static async getRuleByKey(ruleKey: string): Promise<IAlertRule | null> {
    await AlertRuleService.ensureDefaultRules();
    return AlertRule.findOne({ ruleKey: String(ruleKey || "").trim() });
  }

  static async updateRuleByKey(
    ruleKey: string,
    patch: Partial<{
      enabled: boolean;
      severity: "P1" | "P2" | "P3";
      windowMinutes: number;
      minSampleCount: number;
      thresholdType: "count" | "rate" | "ratio_vs_baseline";
      thresholdValue: number;
      recoverValue: number;
      consecutiveHits: number;
      cooldownMinutes: number;
      params: Record<string, unknown>;
      name: string;
      description: string;
    }>,
  ): Promise<IAlertRule | null> {
    const sanitizedKey = String(ruleKey || "").trim();
    if (!sanitizedKey) return null;
    const nextSet: Record<string, unknown> = {};
    const allowedFields = [
      "enabled",
      "severity",
      "windowMinutes",
      "minSampleCount",
      "thresholdType",
      "thresholdValue",
      "recoverValue",
      "consecutiveHits",
      "cooldownMinutes",
      "name",
      "description",
    ] as const;
    for (const field of allowedFields) {
      if (patch[field] !== undefined) {
        nextSet[field] = patch[field];
      }
    }
    if (patch.params && typeof patch.params === "object") {
      nextSet.params = patch.params;
    }
    if (Object.keys(nextSet).length === 0) {
      return AlertRule.findOne({ ruleKey: sanitizedKey });
    }
    return AlertRule.findOneAndUpdate(
      { ruleKey: sanitizedKey },
      { $set: nextSet },
      { new: true },
    );
  }

  static async toggleRule(ruleKey: string, enabled: boolean): Promise<IAlertRule | null> {
    return AlertRule.findOneAndUpdate(
      { ruleKey: String(ruleKey || "").trim() },
      { $set: { enabled: Boolean(enabled) } },
      { new: true },
    );
  }
}
