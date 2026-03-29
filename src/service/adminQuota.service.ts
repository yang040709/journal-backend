import User from "../model/User";
import UserAiUsageDaily from "../model/UserAiUsageDaily";
import UserUploadQuotaDaily from "../model/UserUploadQuotaDaily";
import UserAdRewardLog, {
  type AdRewardType,
} from "../model/UserAdRewardLog";

async function mapBizUserIdsToMongoIds(
  bizUserIds: string[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(bizUserIds.filter(Boolean))];
  if (uniq.length === 0) {
    return new Map();
  }
  const users = await User.find({ userId: { $in: uniq } })
    .select("_id userId")
    .lean();
  return new Map(users.map((u) => [u.userId, u._id.toString()]));
}

function clampPageLimit(page: number, limit: number) {
  const p = Math.max(1, page);
  const l = Math.min(100, Math.max(1, limit));
  return { page: p, limit: l, skip: (p - 1) * l };
}

export class AdminQuotaService {
  static async listAiUsageDaily(params: {
    page: number;
    limit: number;
    userId?: string;
    dateKeyFrom?: string;
    dateKeyTo?: string;
  }) {
    const { page, limit, skip } = clampPageLimit(params.page, params.limit);
    const q: Record<string, unknown> = {};
    if (params.userId?.trim()) {
      q.userId = params.userId.trim();
    }
    if (params.dateKeyFrom || params.dateKeyTo) {
      const dk: Record<string, string> = {};
      if (params.dateKeyFrom?.trim()) {
        dk.$gte = params.dateKeyFrom.trim();
      }
      if (params.dateKeyTo?.trim()) {
        dk.$lte = params.dateKeyTo.trim();
      }
      q.dateKey = dk;
    }
    const [rows, total] = await Promise.all([
      UserAiUsageDaily.find(q)
        .sort({ dateKey: -1, userId: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserAiUsageDaily.countDocuments(q),
    ]);
    const idMap = await mapBizUserIdsToMongoIds(rows.map((r) => r.userId));
    const items = rows.map((r) => ({
      id: r._id.toString(),
      userId: r.userId,
      mongoUserId: idMap.get(r.userId) ?? null,
      dateKey: r.dateKey,
      usedCount: r.usedCount,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return { items, total, page, limit };
  }

  static async listUploadQuotaDaily(params: {
    page: number;
    limit: number;
    userId?: string;
    dateKeyFrom?: string;
    dateKeyTo?: string;
  }) {
    const { page, limit, skip } = clampPageLimit(params.page, params.limit);
    const q: Record<string, unknown> = {};
    if (params.userId?.trim()) {
      q.userId = params.userId.trim();
    }
    if (params.dateKeyFrom || params.dateKeyTo) {
      const dk: Record<string, string> = {};
      if (params.dateKeyFrom?.trim()) {
        dk.$gte = params.dateKeyFrom.trim();
      }
      if (params.dateKeyTo?.trim()) {
        dk.$lte = params.dateKeyTo.trim();
      }
      q.dateKey = dk;
    }
    const [rows, total] = await Promise.all([
      UserUploadQuotaDaily.find(q)
        .sort({ dateKey: -1, userId: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserUploadQuotaDaily.countDocuments(q),
    ]);
    const idMap = await mapBizUserIdsToMongoIds(rows.map((r) => r.userId));
    const items = rows.map((r) => ({
      id: r._id.toString(),
      userId: r.userId,
      mongoUserId: idMap.get(r.userId) ?? null,
      dateKey: r.dateKey,
      baseLimit: r.baseLimit,
      extraQuota: r.extraQuota,
      usedCount: r.usedCount,
      bizBreakdown: r.bizBreakdown,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return { items, total, page, limit };
  }

  static async listAdRewardLogs(params: {
    page: number;
    limit: number;
    userId?: string;
    rewardType?: AdRewardType;
    createdAtFrom?: number;
    createdAtTo?: number;
  }) {
    const { page, limit, skip } = clampPageLimit(params.page, params.limit);
    const q: Record<string, unknown> = {};
    if (params.userId?.trim()) {
      q.userId = params.userId.trim();
    }
    if (params.rewardType) {
      q.rewardType = params.rewardType;
    }
    if (params.createdAtFrom != null || params.createdAtTo != null) {
      const ca: Record<string, Date> = {};
      if (params.createdAtFrom != null) {
        ca.$gte = new Date(params.createdAtFrom);
      }
      if (params.createdAtTo != null) {
        ca.$lte = new Date(params.createdAtTo);
      }
      q.createdAt = ca;
    }
    const [rows, total] = await Promise.all([
      UserAdRewardLog.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserAdRewardLog.countDocuments(q),
    ]);
    const idMap = await mapBizUserIdsToMongoIds(rows.map((r) => r.userId));
    const items = rows.map((r) => ({
      id: r._id.toString(),
      userId: r.userId,
      mongoUserId: idMap.get(r.userId) ?? null,
      rewardToken: r.rewardToken,
      rewardType: r.rewardType,
      rewardValue: r.rewardValue,
      adProvider: r.adProvider,
      adUnitId: r.adUnitId,
      requestId: r.requestId,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return { items, total, page, limit };
  }
}
