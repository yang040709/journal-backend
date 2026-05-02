import User from "../model/User";
import UserAiConsumptionLog from "../model/UserAiConsumptionLog";
import logger from "../utils/logger";

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

export class AiConsumptionLogService {
  static async recordJournalSuccess(params: {
    userId: string;
    dateKey: string;
    mode: string;
    styleKey: string;
    userPrompt: string;
    outputText: string;
  }): Promise<void> {
    try {
      await UserAiConsumptionLog.create({
        userId: params.userId,
        dateKey: params.dateKey,
        source: "journal",
        mode: params.mode,
        styleKey: params.styleKey,
        userPrompt: params.userPrompt,
        outputText: params.outputText,
      });
    } catch (e) {
      logger.error("UserAiConsumptionLog journal insert failed:", e);
    }
  }

  static async recordTemplateSuccess(params: {
    userId: string;
    dateKey: string;
    mode: string;
    userPrompt: string;
    outputText: string;
  }): Promise<void> {
    try {
      await UserAiConsumptionLog.create({
        userId: params.userId,
        dateKey: params.dateKey,
        source: "template",
        mode: params.mode,
        userPrompt: params.userPrompt,
        outputText: params.outputText,
      });
    } catch (e) {
      logger.error("UserAiConsumptionLog template insert failed:", e);
    }
  }

  static async listForAdmin(params: {
    page: number;
    limit: number;
    userId?: string;
    source?: "journal" | "template";
    mode?: string;
    dateKeyFrom?: string;
    dateKeyTo?: string;
    createdAtFrom?: number;
    createdAtTo?: number;
  }) {
    const { page, limit, skip } = clampPageLimit(params.page, params.limit);
    const q: Record<string, unknown> = {};
    if (params.userId?.trim()) {
      q.userId = params.userId.trim();
    }
    if (params.source) {
      q.source = params.source;
    }
    if (params.mode?.trim()) {
      q.mode = params.mode.trim();
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
      UserAiConsumptionLog.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserAiConsumptionLog.countDocuments(q),
    ]);
    const idMap = await mapBizUserIdsToMongoIds(rows.map((r) => r.userId));
    const items = rows.map((r) => ({
      id: r._id.toString(),
      userId: r.userId,
      mongoUserId: idMap.get(r.userId) ?? null,
      dateKey: r.dateKey,
      source: r.source,
      mode: r.mode,
      styleKey: r.styleKey ?? "",
      userPrompt: r.userPrompt,
      outputText: r.outputText,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return { items, total, page, limit };
  }
}
