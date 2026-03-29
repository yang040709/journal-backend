import User from "../model/User";
import UserAdRewardLog from "../model/UserAdRewardLog";
import SystemConfig, { SYSTEM_CONFIG_POINTS_RULES_KEY } from "../model/SystemConfig";
import PointsLedger from "../model/PointsLedger";
import PointsRuleChangeLog from "../model/PointsRuleChangeLog";
import { getQuotaDateContext } from "../utils/dateKey";
import { ActivityLogger } from "../utils/ActivityLogger";

/** 默认新用户积分、广告与兑换（与产品规格一致，可被 DB 配置覆盖） */
export const DEFAULT_POINTS_RULES = {
  pointsPerAd: 100,
  globalAdDailyLimit: 5,
  uploadExchange: { enabled: true, pointsCost: 100, quotaGain: 3 },
  aiExchange: { enabled: true, pointsCost: 100, quotaGain: 10 },
} as const;

export type PointsRulesPayload = {
  pointsPerAd: number;
  globalAdDailyLimit: number;
  uploadExchange: { enabled: boolean; pointsCost: number; quotaGain: number };
  aiExchange: { enabled: boolean; pointsCost: number; quotaGain: number };
};

function clampInt(n: unknown, fallback: number, min: number, max?: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  let x = Math.floor(v);
  if (x < min) x = min;
  if (max != null && x > max) x = max;
  return x;
}

function normalizeRules(raw: unknown): PointsRulesPayload {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const up = r.uploadExchange && typeof r.uploadExchange === "object" ? (r.uploadExchange as Record<string, unknown>) : {};
  const ai = r.aiExchange && typeof r.aiExchange === "object" ? (r.aiExchange as Record<string, unknown>) : {};
  return {
    pointsPerAd: clampInt(r.pointsPerAd, DEFAULT_POINTS_RULES.pointsPerAd, 1, 1_000_000),
    globalAdDailyLimit: clampInt(
      r.globalAdDailyLimit,
      DEFAULT_POINTS_RULES.globalAdDailyLimit,
      1,
      999,
    ),
    uploadExchange: {
      enabled: up.enabled !== false,
      pointsCost: clampInt(up.pointsCost, DEFAULT_POINTS_RULES.uploadExchange.pointsCost, 1, 1_000_000),
      quotaGain: clampInt(up.quotaGain, DEFAULT_POINTS_RULES.uploadExchange.quotaGain, 1, 1_000_000),
    },
    aiExchange: {
      enabled: ai.enabled !== false,
      pointsCost: clampInt(ai.pointsCost, DEFAULT_POINTS_RULES.aiExchange.pointsCost, 1, 1_000_000),
      quotaGain: clampInt(ai.quotaGain, DEFAULT_POINTS_RULES.aiExchange.quotaGain, 1, 1_000_000),
    },
  };
}

export class PointsAdRewardInvalidError extends Error {
  public readonly code = "POINTS_AD_REWARD_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "PointsAdRewardInvalidError";
  }
}

export class PointsAdRewardDailyLimitExceededError extends Error {
  public readonly code = "POINTS_AD_REWARD_DAILY_LIMIT_EXCEEDED";
  public readonly details: { todayAdRewardCount: number; todayAdRewardLimit: number };
  constructor(details: { todayAdRewardCount: number; todayAdRewardLimit: number }) {
    super(
      `今日观看广告次数已达上限（${details.todayAdRewardCount}/${details.todayAdRewardLimit}次），明日再来`,
    );
    this.name = "PointsAdRewardDailyLimitExceededError";
    this.details = details;
  }
}

export class PointsExchangeDisabledError extends Error {
  public readonly code = "POINTS_EXCHANGE_DISABLED";
  constructor(message = "兑换暂时不可用") {
    super(message);
    this.name = "PointsExchangeDisabledError";
  }
}

export class PointsInsufficientError extends Error {
  public readonly code = "POINTS_INSUFFICIENT";
  constructor(message = "积分不足") {
    super(message);
    this.name = "PointsInsufficientError";
  }
}

export class PointsExchangeInvalidError extends Error {
  public readonly code = "POINTS_EXCHANGE_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "PointsExchangeInvalidError";
  }
}

export interface GrantPointsAdRewardInput {
  adProvider: string;
  adUnitId: string;
  rewardToken: string;
  requestId?: string;
}

export interface PointsSummary {
  points: number;
  todayAdRewardCount: number;
  todayAdRewardLimit: number;
  rules: {
    pointsPerAd: number;
    globalAdDailyLimit: number;
    uploadExchange: {
      enabled: boolean;
      pointsCost: number;
      quotaGain: number;
    };
    aiExchange: {
      enabled: boolean;
      pointsCost: number;
      quotaGain: number;
    };
  };
}

async function loadRulesDocRaw(): Promise<Record<string, unknown> | null> {
  const doc = await SystemConfig.findOne({ configKey: SYSTEM_CONFIG_POINTS_RULES_KEY })
    .select("pointsRules")
    .lean();
  const pr = doc?.pointsRules;
  if (pr && typeof pr === "object") return pr as Record<string, unknown>;
  return null;
}

export class PointsService {
  static async getRules(): Promise<PointsRulesPayload> {
    await PointsService.ensureRulesDocumentExists();
    const raw = await loadRulesDocRaw();
    return normalizeRules(raw ?? {});
  }

  /** 确保库中存在 points_rules 文档（首次读取时写入默认值，不改变已有配置） */
  static async ensureRulesDocumentExists(): Promise<void> {
    const exists = await SystemConfig.exists({ configKey: SYSTEM_CONFIG_POINTS_RULES_KEY });
    if (!exists) {
      await SystemConfig.create({
        configKey: SYSTEM_CONFIG_POINTS_RULES_KEY,
        coverUrls: [],
        tagNames: [],
        initialNotebookTemplates: [],
        initialNotebookCount: 0,
        pointsRules: { ...DEFAULT_POINTS_RULES },
      });
    }
  }

  static async setRulesFromAdmin(
    payload: Partial<{
      pointsPerAd: number;
      globalAdDailyLimit: number;
      uploadExchange: { enabled?: boolean; pointsCost?: number; quotaGain?: number };
      aiExchange: { enabled?: boolean; pointsCost?: number; quotaGain?: number };
    }>,
    admin: { id: string; username: string },
  ): Promise<PointsRulesPayload> {
    await PointsService.ensureRulesDocumentExists();
    const prev = await PointsService.getRules();
    const merged: PointsRulesPayload = {
      pointsPerAd: payload.pointsPerAd ?? prev.pointsPerAd,
      globalAdDailyLimit: payload.globalAdDailyLimit ?? prev.globalAdDailyLimit,
      uploadExchange: {
        enabled: payload.uploadExchange?.enabled ?? prev.uploadExchange.enabled,
        pointsCost: payload.uploadExchange?.pointsCost ?? prev.uploadExchange.pointsCost,
        quotaGain: payload.uploadExchange?.quotaGain ?? prev.uploadExchange.quotaGain,
      },
      aiExchange: {
        enabled: payload.aiExchange?.enabled ?? prev.aiExchange.enabled,
        pointsCost: payload.aiExchange?.pointsCost ?? prev.aiExchange.pointsCost,
        quotaGain: payload.aiExchange?.quotaGain ?? prev.aiExchange.quotaGain,
      },
    };
    const next = normalizeRules(merged);
    const oldSnapshot = { ...prev } as unknown as Record<string, unknown>;
    const newSnapshot = { ...next } as unknown as Record<string, unknown>;
    await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_POINTS_RULES_KEY },
      {
        $set: { pointsRules: next },
        $setOnInsert: {
          configKey: SYSTEM_CONFIG_POINTS_RULES_KEY,
          coverUrls: [],
          tagNames: [],
          initialNotebookTemplates: [],
          initialNotebookCount: 0,
        },
      },
      { upsert: true, new: true },
    );
    await PointsRuleChangeLog.create({
      adminId: admin.id,
      adminUsername: admin.username,
      oldRules: oldSnapshot,
      newRules: newSnapshot,
      effectiveAt: new Date(),
    });
    return next;
  }

  /** 今日已看激励视频次数（统一计 points 类型） */
  static async getTodayVideoAdCount(userId: string): Promise<number> {
    const { dateKey } = getQuotaDateContext();
    const startOfDay = new Date(`${dateKey}T00:00:00+08:00`);
    const endOfDay = new Date(`${dateKey}T23:59:59.999+08:00`);
    const count = await UserAdRewardLog.countDocuments({
      userId,
      rewardType: "points",
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });
    return Math.max(0, count);
  }

  static async getEffectiveDailyAdLimit(userId: string, rules: PointsRulesPayload): Promise<number> {
    const user = await User.findOne({ userId }).select("adRewardDailyLimit").lean();
    const override = user?.adRewardDailyLimit;
    if (typeof override === "number" && Number.isFinite(override) && override >= 1) {
      return Math.min(999, Math.floor(override));
    }
    return rules.globalAdDailyLimit;
  }

  /** 老用户缺字段时一次性补 200 分 */
  static async bootstrapLegacyUserPoints(userId: string): Promise<void> {
    await User.updateMany(
      { userId, $or: [{ points: { $exists: false } }, { points: null }] },
      { $set: { points: 200 } },
    );
  }

  static async getSummary(userId: string): Promise<PointsSummary> {
    await PointsService.ensureRulesDocumentExists();
    await PointsService.bootstrapLegacyUserPoints(userId);
    const rules = await PointsService.getRules();
    const [user, todayCount, limit] = await Promise.all([
      User.findOne({ userId }).select("points").lean(),
      PointsService.getTodayVideoAdCount(userId),
      PointsService.getEffectiveDailyAdLimit(userId, rules),
    ]);
    const points = Math.max(0, Math.floor(Number((user as { points?: number })?.points ?? 0)));
    return {
      points,
      todayAdRewardCount: todayCount,
      todayAdRewardLimit: limit,
      rules: {
        pointsPerAd: rules.pointsPerAd,
        globalAdDailyLimit: rules.globalAdDailyLimit,
        uploadExchange: { ...rules.uploadExchange },
        aiExchange: { ...rules.aiExchange },
      },
    };
  }

  static async grantAdReward(
    userId: string,
    input: GrantPointsAdRewardInput,
  ): Promise<{ rewardPoints: number; points: number; duplicated: boolean }> {
    await PointsService.ensureRulesDocumentExists();
    await PointsService.bootstrapLegacyUserPoints(userId);
    const rules = await PointsService.getRules();
    const rewardToken = String(input.rewardToken || "").trim();
    if (!rewardToken) {
      throw new PointsAdRewardInvalidError("奖励凭证不能为空");
    }

    const existed = await UserAdRewardLog.findOne({ rewardToken }).lean();
    if (existed) {
      if (existed.userId !== userId) {
        throw new PointsAdRewardInvalidError("奖励凭证无效");
      }
      const u = await User.findOne({ userId }).select("points").lean();
      const points = Math.max(0, Math.floor(Number((u as { points?: number })?.points ?? 0)));
      return {
        rewardPoints: Number(existed.rewardValue || rules.pointsPerAd),
        points,
        duplicated: true,
      };
    }

    const dailyLimit = await PointsService.getEffectiveDailyAdLimit(userId, rules);
    const todayCount = await PointsService.getTodayVideoAdCount(userId);
    if (todayCount >= dailyLimit) {
      throw new PointsAdRewardDailyLimitExceededError({
        todayAdRewardCount: todayCount,
        todayAdRewardLimit: dailyLimit,
      });
    }

    const rewardPoints = rules.pointsPerAd;
    try {
      await UserAdRewardLog.create({
        userId,
        rewardToken,
        rewardType: "points",
        rewardValue: rewardPoints,
        adProvider: String(input.adProvider || "").trim(),
        adUnitId: String(input.adUnitId || "").trim(),
        requestId: String(input.requestId || "").trim(),
        status: "success",
      });
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e?.code === 11000) {
        const u = await User.findOne({ userId }).select("points").lean();
        const points = Math.max(0, Math.floor(Number((u as { points?: number })?.points ?? 0)));
        return { rewardPoints, points, duplicated: true };
      }
      throw err;
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId }, $inc: { points: rewardPoints } },
      { upsert: true, new: true },
    ).lean();
    const points = Math.max(0, Math.floor(Number((updatedUser as { points?: number })?.points ?? 0)));

    void ActivityLogger.record(
      {
        type: "update",
        target: "user",
        targetId: userId,
        title: `观看激励视频：积分 +${rewardPoints}（当前 ${points}）`,
        userId,
      },
      { blocking: false },
    );

    return { rewardPoints, points, duplicated: false };
  }

  static async exchange(
    userId: string,
    kind: "upload" | "ai",
  ): Promise<{
    points: number;
    quotaGain: number;
    uploadExtraQuotaTotal?: number;
    aiBonusQuota?: number;
  }> {
    await PointsService.ensureRulesDocumentExists();
    await PointsService.bootstrapLegacyUserPoints(userId);
    const rules = await PointsService.getRules();
    const tier =
      kind === "upload" ? rules.uploadExchange : rules.aiExchange;
    if (!tier.enabled) {
      throw new PointsExchangeDisabledError("兑换功能维护中，请稍后再试");
    }
    const cost = tier.pointsCost;
    const gain = tier.quotaGain;
    if (cost < 1 || gain < 1) {
      throw new PointsExchangeInvalidError("兑换配置无效");
    }

    const ruleSnapshot = {
      kind,
      pointsCost: cost,
      quotaGain: gain,
    } as Record<string, unknown>;

    const incQuota = kind === "upload" ? { uploadExtraQuotaTotal: gain } : { aiBonusQuota: gain };

    const updated = await User.findOneAndUpdate(
      { userId, points: { $gte: cost } },
      {
        $inc: {
          points: -cost,
          ...incQuota,
        },
      },
      { new: true },
    ).lean();

    if (!updated) {
      const u = await User.findOne({ userId }).select("points").lean();
      const p = Math.max(0, Math.floor(Number((u as { points?: number })?.points ?? 0)));
      if (!u) {
        throw new PointsExchangeInvalidError("用户不存在");
      }
      if (p < cost) {
        throw new PointsInsufficientError();
      }
      throw new PointsExchangeInvalidError("兑换失败，请重试");
    }

    const ledgerKind = kind === "upload" ? "exchange_upload" : "exchange_ai";
    await PointsLedger.create({
      userId,
      kind: ledgerKind,
      pointsDelta: -cost,
      quotaDelta: gain,
      ruleSnapshot,
    });

    const points = Math.max(0, Math.floor(Number((updated as { points?: number }).points ?? 0)));
    const uploadExtra = Math.max(
      0,
      Math.floor(Number((updated as { uploadExtraQuotaTotal?: number }).uploadExtraQuotaTotal ?? 0)),
    );
    const aiBonus = Math.max(
      0,
      Math.floor(Number((updated as { aiBonusQuota?: number }).aiBonusQuota ?? 0)),
    );

    if (kind === "upload") {
      const { dateKey } = getQuotaDateContext();
      const { ensureDailyQuotaRecord, getUploadDailyBaseLimit } = await import("./upload.service.js");
      const base = getUploadDailyBaseLimit();
      await ensureDailyQuotaRecord(userId, dateKey, base, uploadExtra);
    }

    void ActivityLogger.record(
      {
        type: "update",
        target: "user",
        targetId: userId,
        title:
          kind === "upload"
            ? `积分兑换：上传永久额度 +${gain}（消耗 ${cost} 积分）`
            : `积分兑换：AI 永久次数 +${gain}（消耗 ${cost} 积分）`,
        userId,
      },
      { blocking: false },
    );

    if (kind === "upload") {
      return { points, quotaGain: gain, uploadExtraQuotaTotal: uploadExtra };
    }
    return { points, quotaGain: gain, aiBonusQuota: aiBonus };
  }

  static async adminSetPoints(
    userId: string,
    newPoints: number,
                      reason: string,
                      admin: { id: string; username: string },
  ): Promise<{ points: number }> {
    await PointsService.bootstrapLegacyUserPoints(userId);
    const user = await User.findOne({ userId }).select("points").lean();
    if (!user) {
      throw new Error("用户不存在");
    }
    const prev = Math.max(0, Math.floor(Number((user as { points?: number }).points ?? 0)));
    const next = Math.max(0, Math.floor(newPoints));
    const delta = next - prev;
    await User.updateOne({ userId }, { $set: { points: next } });
    if (delta !== 0) {
      await PointsLedger.create({
        userId,
        kind: "admin_adjust",
        pointsDelta: delta,
        reason: reason.trim(),
        adminId: admin.id,
        adminUsername: admin.username,
      });
    }
    return { points: next };
  }
}
