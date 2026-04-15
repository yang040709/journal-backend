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
  /** 0 表示每日观看激励视频得积分不设上限 */
  globalAdDailyLimit: 0,
  uploadExchange: { enabled: true, pointsCost: 100, quotaGain: 3 },
  aiExchange: { enabled: true, pointsCost: 100, quotaGain: 10 },
  feedbackRewards: {
    weeklyFirstSubmit: 200,
    important: 500,
    critical: 2000,
  },
} as const;

export type PointsRulesPayload = {
  pointsPerAd: number;
  globalAdDailyLimit: number;
  uploadExchange: { enabled: boolean; pointsCost: number; quotaGain: number };
  aiExchange: { enabled: boolean; pointsCost: number; quotaGain: number };
  feedbackRewards: {
    weeklyFirstSubmit: number;
    important: number;
    critical: number;
  };
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
  const feedbackRewards =
    r.feedbackRewards && typeof r.feedbackRewards === "object"
      ? (r.feedbackRewards as Record<string, unknown>)
      : {};
  return {
    pointsPerAd: clampInt(r.pointsPerAd, DEFAULT_POINTS_RULES.pointsPerAd, 1, 1_000_000),
    globalAdDailyLimit: clampInt(
      r.globalAdDailyLimit,
      DEFAULT_POINTS_RULES.globalAdDailyLimit,
      0,
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
    feedbackRewards: {
      weeklyFirstSubmit: clampInt(
        feedbackRewards.weeklyFirstSubmit,
        DEFAULT_POINTS_RULES.feedbackRewards.weeklyFirstSubmit,
        0,
        1_000_000,
      ),
      important: clampInt(
        feedbackRewards.important,
        DEFAULT_POINTS_RULES.feedbackRewards.important,
        0,
        1_000_000,
      ),
      critical: clampInt(
        feedbackRewards.critical,
        DEFAULT_POINTS_RULES.feedbackRewards.critical,
        0,
        1_000_000,
      ),
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
    feedbackRewards: {
      weeklyFirstSubmit: number;
      important: number;
      critical: number;
    };
  };
}

type LedgerFlowType = "income" | "expense";

interface UserTransactionQuery {
  page: number;
  pageSize: number;
  flowType: "all" | LedgerFlowType;
}

interface AdminTransactionQuery extends UserTransactionQuery {
  userId?: string;
  keyword?: string;
  bizType?: string;
  startTime?: Date;
  endTime?: Date;
}

export interface GrantPointsByBizInput {
  userId: string;
  points: number;
  kind?: "feedback_reward" | "ad_reward";
  bizType: string;
  bizId: string;
  title: string;
  operatorType?: "system" | "admin" | "user";
  operatorId?: string;
  operatorName?: string;
  remark?: string;
}

const MAX_PAGE_DEPTH = 10_000;
const MIN_KEYWORD_LENGTH = 2;

function buildFlowTypeFromDelta(pointsDelta: number): LedgerFlowType {
  return pointsDelta >= 0 ? "income" : "expense";
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
      feedbackRewards: {
        weeklyFirstSubmit?: number;
        important?: number;
        critical?: number;
      };
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
      feedbackRewards: {
        weeklyFirstSubmit:
          payload.feedbackRewards?.weeklyFirstSubmit ?? prev.feedbackRewards.weeklyFirstSubmit,
        important: payload.feedbackRewards?.important ?? prev.feedbackRewards.important,
        critical: payload.feedbackRewards?.critical ?? prev.feedbackRewards.critical,
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
        feedbackRewards: { ...rules.feedbackRewards },
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
    if (dailyLimit > 0 && todayCount >= dailyLimit) {
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
    const balanceBefore = Math.max(0, points - rewardPoints);

    try {
      await PointsLedger.create({
        userId,
        kind: "ad_reward",
        bizType: "ad_reward",
        bizId: rewardToken,
        title: "观看广告奖励",
        flowType: buildFlowTypeFromDelta(rewardPoints),
        pointsDelta: rewardPoints,
        balanceBefore,
        balanceAfter: points,
        operatorType: "system",
        operatorId: "points.ad_reward",
        operatorName: "system",
      });
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e?.code !== 11000) {
        throw err;
      }
    }

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
    opts?: { requestId?: string },
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
    const bizType = kind === "upload" ? "exchange_image_quota" : "exchange_ai_quota";
    const balanceAfter = Math.max(0, Math.floor(Number((updated as { points?: number }).points ?? 0)));
    const balanceBefore = balanceAfter + cost;
    const bizId =
      opts?.requestId && String(opts.requestId).trim()
        ? String(opts.requestId).trim()
        : `exchange_${userId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await PointsLedger.create({
      userId,
      kind: ledgerKind,
      bizType,
      bizId,
      title: kind === "upload" ? "兑换图片上传额度" : "兑换 AI 次数",
      flowType: buildFlowTypeFromDelta(-cost),
      pointsDelta: -cost,
      balanceBefore,
      balanceAfter,
      quotaDelta: gain,
      ruleSnapshot,
      operatorType: "user",
      operatorId: userId,
      operatorName: userId,
    });

    const points = balanceAfter;
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
      const base = await getUploadDailyBaseLimit();
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

  private static serializeLedgerRow(row: Record<string, unknown>) {
    const pointsDelta = Number(row.pointsDelta ?? 0);
    const type = pointsDelta >= 0 ? "income" : "expense";
    const kind = String(row.kind ?? "");
    const titleByKind: Record<string, string> = {
      ad_reward: "观看广告奖励",
      exchange_upload: "兑换图片上传额度",
      exchange_ai: "兑换 AI 次数",
      admin_adjust: "后台积分调整",
      feedback_reward: "反馈奖励",
    };
    const occurredAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt;
    return {
      id: String(row._id ?? ""),
      title: String(row.title || titleByKind[kind] || "积分变动"),
      type,
      bizType: String(row.bizType || kind || "unknown"),
      change: pointsDelta,
      balanceBefore: Number(row.balanceBefore ?? 0),
      balanceAfter: Number(row.balanceAfter ?? 0),
      occurredAt,
      remark: String(row.remark || row.reason || ""),
      operatorType: row.operatorType || null,
      operatorId: row.operatorId || row.adminId || null,
      operatorName: row.operatorName || row.adminUsername || null,
      userId: row.userId ? String(row.userId) : undefined,
    };
  }

  private static buildLedgerQuery(
    query: UserTransactionQuery | AdminTransactionQuery,
    fixedUserId?: string,
  ): Record<string, unknown> {
    const q: Record<string, unknown> = {};
    if (fixedUserId) {
      q.userId = fixedUserId;
    } else if ((query as AdminTransactionQuery).userId) {
      q.userId = String((query as AdminTransactionQuery).userId).trim();
    }
    if (query.flowType === "income") {
      q.pointsDelta = { $gt: 0 };
    } else if (query.flowType === "expense") {
      q.pointsDelta = { $lt: 0 };
    }
    const adminQuery = query as AdminTransactionQuery;
    if (adminQuery.bizType?.trim()) {
      q.bizType = adminQuery.bizType.trim();
    }
    if (adminQuery.keyword?.trim()) {
      q.userId = { $regex: adminQuery.keyword.trim(), $options: "i" };
    }
    if (adminQuery.startTime || adminQuery.endTime) {
      const createdAt: Record<string, Date> = {};
      if (adminQuery.startTime) createdAt.$gte = adminQuery.startTime;
      if (adminQuery.endTime) createdAt.$lte = adminQuery.endTime;
      q.createdAt = createdAt;
    }
    return q;
  }

  static async listUserTransactions(userId: string, query: UserTransactionQuery) {
    const page = Math.max(1, Math.floor(Number(query.page || 1)));
    const pageSize = Math.min(50, Math.max(1, Math.floor(Number(query.pageSize || 20))));
    if (page * pageSize > MAX_PAGE_DEPTH) {
      throw new Error(`分页深度超过限制（page*pageSize <= ${MAX_PAGE_DEPTH}）`);
    }
    const skip = (page - 1) * pageSize;
    const q = PointsService.buildLedgerQuery(query, userId);
    const [rows, total, user] = await Promise.all([
      PointsLedger.find(q).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
      PointsLedger.countDocuments(q),
      User.findOne({ userId }).select("points").lean(),
    ]);
    const currentBalance = Math.max(0, Math.floor(Number((user as { points?: number })?.points ?? 0)));
    return {
      list: rows.map((row) => PointsService.serializeLedgerRow(row as unknown as Record<string, unknown>)),
      pagination: {
        page,
        pageSize,
        total,
        hasMore: skip + rows.length < total,
      },
      summary: { currentBalance },
    };
  }

  static async adminListTransactions(query: AdminTransactionQuery) {
    const page = Math.max(1, Math.floor(Number(query.page || 1)));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize || 20))));
    if (page * pageSize > MAX_PAGE_DEPTH) {
      throw new Error(`分页深度超过限制（page*pageSize <= ${MAX_PAGE_DEPTH}）`);
    }
    if (query.keyword?.trim() && query.keyword.trim().length < MIN_KEYWORD_LENGTH) {
      throw new Error(`搜索关键词至少 ${MIN_KEYWORD_LENGTH} 个字符`);
    }
    const skip = (page - 1) * pageSize;
    const q = PointsService.buildLedgerQuery(query);
    const [rows, total] = await Promise.all([
      PointsLedger.find(q).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
      PointsLedger.countDocuments(q),
    ]);
    return {
      list: rows.map((row) => PointsService.serializeLedgerRow(row as unknown as Record<string, unknown>)),
      pagination: {
        page,
        pageSize,
        total,
        hasMore: skip + rows.length < total,
      },
    };
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
        bizType: "admin_adjust",
        title: "后台积分调整",
        flowType: buildFlowTypeFromDelta(delta),
        pointsDelta: delta,
        balanceBefore: prev,
        balanceAfter: next,
        reason: reason.trim(),
        adminId: admin.id,
        adminUsername: admin.username,
        operatorType: "admin",
        operatorId: admin.id,
        operatorName: admin.username,
        remark: reason.trim(),
      });
    }
    return { points: next };
  }

  static async grantPointsByBiz(input: GrantPointsByBizInput): Promise<{
    points: number;
    duplicated: boolean;
  }> {
    const pointsToAdd = Math.max(0, Math.floor(Number(input.points || 0)));
    if (pointsToAdd <= 0) {
      const user = await User.findOne({ userId: input.userId }).select("points").lean();
      return {
        points: Math.max(0, Math.floor(Number((user as { points?: number })?.points ?? 0))),
        duplicated: true,
      };
    }

    const existed = await PointsLedger.findOne({
      bizType: input.bizType,
      bizId: input.bizId,
    })
      .select("_id")
      .lean();
    if (existed) {
      const user = await User.findOne({ userId: input.userId }).select("points").lean();
      return {
        points: Math.max(0, Math.floor(Number((user as { points?: number })?.points ?? 0))),
        duplicated: true,
      };
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId: input.userId },
      { $setOnInsert: { userId: input.userId }, $inc: { points: pointsToAdd } },
      { upsert: true, new: true },
    ).lean();
    const balanceAfter = Math.max(0, Math.floor(Number((updatedUser as { points?: number })?.points ?? 0)));
    const balanceBefore = Math.max(0, balanceAfter - pointsToAdd);

    try {
      await PointsLedger.create({
        userId: input.userId,
        kind: input.kind || "feedback_reward",
        bizType: input.bizType,
        bizId: input.bizId,
        title: input.title,
        flowType: "income",
        pointsDelta: pointsToAdd,
        balanceBefore,
        balanceAfter,
        operatorType: input.operatorType || "system",
        operatorId: input.operatorId || "system.feedback",
        operatorName: input.operatorName || "system",
        remark: input.remark || "",
      });
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e?.code !== 11000) {
        throw err;
      }
      const latest = await User.findOne({ userId: input.userId }).select("points").lean();
      return {
        points: Math.max(0, Math.floor(Number((latest as { points?: number })?.points ?? 0))),
        duplicated: true,
      };
    }

    return { points: balanceAfter, duplicated: false };
  }
}
