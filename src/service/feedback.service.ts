import UserFeedback, { FeedbackReviewLevel, FeedbackType } from "../model/UserFeedback";
import { getQuotaDateContext, previousDateKey } from "../utils/dateKey";
import { PointsService } from "./points.service";
import { normalizeKeyword, toSafeRegex } from "../utils/querySafety";

const RATE_LIMIT_MS = 60 * 1000;
const MAX_PAGE_DEPTH = 10_000;

function normalizeInt(v: unknown, fallback: number, min = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}

function toDateInShanghai(dateKey: string, end = false): Date {
  return new Date(`${dateKey}T${end ? "23:59:59.999" : "00:00:00.000"}+08:00`);
}

function getWeekRangeByDateKey(dateKey: string) {
  const weekday = new Date(`${dateKey}T12:00:00+08:00`).getUTCDay();
  const offset = (weekday + 6) % 7;
  let weekStartDateKey = dateKey;
  for (let i = 0; i < offset; i += 1) {
    weekStartDateKey = previousDateKey(weekStartDateKey, "Asia/Shanghai");
  }
  return {
    weekStartDateKey,
    weekEndDate: new Date(toDateInShanghai(weekStartDateKey).getTime() + 7 * 24 * 60 * 60 * 1000 - 1),
  };
}

function reviewRewardTarget(level?: FeedbackReviewLevel, rules?: { important: number; critical: number }) {
  if (!level || !rules) return 0;
  if (level === "important") return normalizeInt(rules.important, 500);
  if (level === "critical") return normalizeInt(rules.critical, 2000);
  return 0;
}

function serializeFeedbackRow(row: Record<string, unknown>) {
  return {
    id: String(row._id || ""),
    userId: String(row.userId || ""),
    type: String(row.type || ""),
    content: String(row.content || ""),
    contact: String(row.contact || ""),
    images: Array.isArray(row.images) ? row.images : [],
    clientMeta: row.clientMeta || null,
    status: String(row.status || "pending"),
    reviewLevel: row.reviewLevel ? String(row.reviewLevel) : null,
    reviewRemark: row.reviewRemark ? String(row.reviewRemark) : "",
    reviewedBy: row.reviewedBy ? String(row.reviewedBy) : "",
    reviewedAt: row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : row.reviewedAt || null,
    weeklyFirstRewardGranted: Boolean(row.weeklyFirstRewardGranted),
    weeklyFirstRewardPoints: normalizeInt(row.weeklyFirstRewardPoints, 0),
    reviewRewardPointsGranted: normalizeInt(row.reviewRewardPointsGranted, 0),
    totalGrantedPoints: normalizeInt(row.totalGrantedPoints, 0),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

export class FeedbackRateLimitError extends Error {
  public readonly code = "FEEDBACK_RATE_LIMIT";
  constructor(message = "提交过于频繁，请稍后再试") {
    super(message);
    this.name = "FeedbackRateLimitError";
  }
}

export class FeedbackService {
  private static csvEscape(value: unknown): string {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  private static buildAdminFeedbackWhere(query: {
    status?: "pending" | "reviewed";
    reviewLevel?: FeedbackReviewLevel;
    type?: FeedbackType;
    keyword?: string;
    userId?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.reviewLevel) where.reviewLevel = query.reviewLevel;
    if (query.type) where.type = query.type;
    if (query.userId) where.userId = query.userId;
    const keyword = normalizeKeyword(query.keyword, { max: 200 });
    if (keyword) {
      where.content = toSafeRegex(keyword);
    }
    return where;
  }
  static async getWeeklyFirstRewardStatus(userId: string) {
    const rules = await PointsService.getRules();
    const { dateKey } = getQuotaDateContext();
    const { weekStartDateKey, weekEndDate } = getWeekRangeByDateKey(dateKey);
    const weekStartDate = toDateInShanghai(weekStartDateKey);
    const granted = Boolean(
      await UserFeedback.exists({
        userId,
        weeklyFirstRewardGranted: true,
        createdAt: { $gte: weekStartDate, $lte: weekEndDate },
      }),
    );
    return {
      weekStartDateKey,
      weekEndAt: weekEndDate.toISOString(),
      granted,
      rewardPoints: normalizeInt(rules.feedbackRewards.weeklyFirstSubmit, 200),
    };
  }

  static async createFeedback(input: {
    userId: string;
    type: FeedbackType;
    content: string;
    contact?: string;
    images?: string[];
    clientMeta?: Record<string, unknown>;
  }) {
    const content = String(input.content || "").trim();
    const contact = String(input.contact || "").trim();
    const images = (Array.isArray(input.images) ? input.images : []).map((x) => String(x || "").trim()).filter(Boolean);
    const now = new Date();

    const latest = await UserFeedback.findOne({ userId: input.userId }).select("createdAt").sort({ createdAt: -1 }).lean();
    if (latest?.createdAt && now.getTime() - new Date(latest.createdAt).getTime() < RATE_LIMIT_MS) {
      throw new FeedbackRateLimitError();
    }

    const { dateKey } = getQuotaDateContext();
    const { weekStartDateKey, weekEndDate } = getWeekRangeByDateKey(dateKey);
    const weekStartDate = toDateInShanghai(weekStartDateKey);
    const [rules, weeklyFirstExists] = await Promise.all([
      PointsService.getRules(),
      UserFeedback.exists({
        userId: input.userId,
        weeklyFirstRewardGranted: true,
        createdAt: { $gte: weekStartDate, $lte: weekEndDate },
      }),
    ]);
    const shouldGrantWeeklyFirst = !weeklyFirstExists;
    const weeklyRewardPoints = shouldGrantWeeklyFirst
      ? normalizeInt(rules.feedbackRewards.weeklyFirstSubmit, 200)
      : 0;

    const doc = await UserFeedback.create({
      userId: input.userId,
      type: input.type,
      content,
      contact,
      images,
      clientMeta: input.clientMeta || null,
      status: "pending",
      weeklyFirstRewardGranted: shouldGrantWeeklyFirst && weeklyRewardPoints > 0,
      weeklyFirstRewardPoints: weeklyRewardPoints,
      reviewRewardPointsGranted: 0,
      totalGrantedPoints: weeklyRewardPoints,
    });

    let currentPoints = 0;
    if (weeklyRewardPoints > 0) {
      const rewardResult = await PointsService.grantPointsByBiz({
        userId: input.userId,
        points: weeklyRewardPoints,
        kind: "feedback_reward",
        bizType: "feedback_weekly_first_reward",
        bizId: String(doc._id),
        title: "反馈周首条奖励",
        operatorType: "system",
        operatorId: "feedback.weekly_first",
        operatorName: "system",
        remark: "每周首次提交反馈奖励",
      });
      currentPoints = rewardResult.points;
    }

    return {
      feedback: serializeFeedbackRow(doc.toObject() as Record<string, unknown>),
      awardedWeeklyPoints: weeklyRewardPoints,
      currentPoints,
    };
  }

  static async getMyFeedbackList(userId: string, query: { page: number; pageSize: number }) {
    const page = Math.max(1, Math.floor(Number(query.page || 1)));
    const pageSize = Math.min(50, Math.max(1, Math.floor(Number(query.pageSize || 20))));
    if (page * pageSize > MAX_PAGE_DEPTH) {
      throw new Error(`分页深度超过限制（page*pageSize <= ${MAX_PAGE_DEPTH}）`);
    }
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      UserFeedback.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
      UserFeedback.countDocuments({ userId }),
    ]);
    return {
      items: rows.map((row) => serializeFeedbackRow(row as Record<string, unknown>)),
      total,
      page,
      pageSize,
      hasMore: skip + rows.length < total,
    };
  }

  static async getMyFeedbackDetail(userId: string, id: string) {
    const row = await UserFeedback.findOne({ _id: id, userId }).lean();
    if (!row) return null;
    return serializeFeedbackRow(row as Record<string, unknown>);
  }

  static async adminListFeedbacks(query: {
    page: number;
    limit: number;
    status?: "pending" | "reviewed";
    reviewLevel?: FeedbackReviewLevel;
    type?: FeedbackType;
    keyword?: string;
    userId?: string;
  }) {
    const page = Math.max(1, Math.floor(Number(query.page || 1)));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit || 20))));
    if (page * limit > MAX_PAGE_DEPTH) {
      throw new Error(`分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`);
    }
    const skip = (page - 1) * limit;
    const where = this.buildAdminFeedbackWhere(query);

    const [items, total] = await Promise.all([
      UserFeedback.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      UserFeedback.countDocuments(where),
    ]);
    return {
      items: items.map((row) => serializeFeedbackRow(row as Record<string, unknown>)),
      total,
      page,
      limit,
    };
  }

  static async adminGetFeedback(id: string) {
    const row = await UserFeedback.findById(id).lean();
    if (!row) return null;
    return serializeFeedbackRow(row as Record<string, unknown>);
  }

  static async adminReviewFeedback(
    id: string,
    payload: { reviewLevel: FeedbackReviewLevel; reviewRemark?: string },
    admin: { id: string; username: string },
  ) {
    const row = await UserFeedback.findById(id);
    if (!row) {
      throw new Error("反馈不存在");
    }

    const rules = await PointsService.getRules();
    const targetReward = reviewRewardTarget(payload.reviewLevel, rules.feedbackRewards);
    const granted = normalizeInt(row.reviewRewardPointsGranted, 0);
    const delta = Math.max(0, targetReward - granted);

    let pointsAfter = 0;
    if (delta > 0) {
      const grantRes = await PointsService.grantPointsByBiz({
        userId: row.userId,
        points: delta,
        kind: "feedback_reward",
        bizType: "feedback_review_reward",
        bizId: `${String(row._id)}_${payload.reviewLevel}_${targetReward}`,
        title:
          payload.reviewLevel === "critical"
            ? "反馈审核奖励（非常重要）"
            : "反馈审核奖励（重要）",
        operatorType: "admin",
        operatorId: admin.id,
        operatorName: admin.username,
        remark: payload.reviewRemark || "",
      });
      pointsAfter = grantRes.points;
      row.reviewRewardPointsGranted = granted + delta;
      row.totalGrantedPoints = normalizeInt(row.weeklyFirstRewardPoints, 0) + row.reviewRewardPointsGranted;
    }

    row.status = "reviewed";
    row.reviewLevel = payload.reviewLevel;
    row.reviewRemark = String(payload.reviewRemark || "").trim();
    row.reviewedBy = admin.username;
    row.reviewedAt = new Date();
    await row.save();

    return {
      feedback: serializeFeedbackRow(row.toObject() as Record<string, unknown>),
      deltaRewardPoints: delta,
      pointsAfter,
    };
  }

  static async adminNextPendingFeedbackId(currentId?: string, direction: "next" | "prev" = "next") {
    if (currentId) {
      const current = await UserFeedback.findById(currentId).select("createdAt").lean();
      if (current?.createdAt) {
        const timeQuery =
          direction === "prev"
            ? { createdAt: { $lt: current.createdAt } }
            : { createdAt: { $gt: current.createdAt } };
        const sortQuery = direction === "prev" ? { createdAt: -1 } : { createdAt: 1 };
        const next = await UserFeedback.findOne({
          status: "pending",
          ...timeQuery,
        })
          .sort(sortQuery)
          .select("_id")
          .lean();
        if (next?._id) return String(next._id);
      }
    }
    const first = await UserFeedback.findOne({ status: "pending" })
      .sort({ createdAt: direction === "prev" ? -1 : 1 })
      .select("_id")
      .lean();
    return first?._id ? String(first._id) : "";
  }

  static async adminBatchReviewFeedbacks(
    ids: string[],
    payload: { reviewLevel: FeedbackReviewLevel; reviewRemark?: string },
    admin: { id: string; username: string },
  ) {
    const uniqueIds = Array.from(
      new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)),
    );
    const failedItems: Array<{ id: string; reason: string }> = [];
    let successCount = 0;
    for (const id of uniqueIds) {
      try {
        await this.adminReviewFeedback(id, payload, admin);
        successCount += 1;
      } catch (e) {
        failedItems.push({
          id,
          reason: e instanceof Error ? e.message : "处理失败",
        });
      }
    }
    return {
      total: uniqueIds.length,
      successCount,
      failedCount: failedItems.length,
      failedItems,
    };
  }

  static async adminExportFeedbacksCsv(input: {
    ids?: string[];
    query?: {
      status?: "pending" | "reviewed";
      reviewLevel?: FeedbackReviewLevel;
      type?: FeedbackType;
      keyword?: string;
      userId?: string;
    };
    limit: number;
  }) {
    const where: Record<string, unknown> = {};
    const ids = Array.isArray(input.ids)
      ? Array.from(new Set(input.ids.map((id) => String(id || "").trim()).filter(Boolean)))
      : [];
    if (ids.length > 0) {
      where._id = { $in: ids };
    } else if (input.query) {
      Object.assign(where, this.buildAdminFeedbackWhere(input.query));
    }

    const rows = await UserFeedback.find(where)
      .sort({ createdAt: -1 })
      .limit(input.limit)
      .lean();
    const header = [
      "反馈ID",
      "用户ID",
      "类型",
      "状态",
      "处理等级",
      "处理人",
      "处理备注",
      "提交时间",
      "处理时间",
      "奖励积分",
    ];
    const lines = [header.map((v) => this.csvEscape(v)).join(",")];
    for (const row of rows) {
      lines.push(
        [
          String(row._id || ""),
          row.userId || "",
          row.type || "",
          row.status || "",
          row.reviewLevel || "",
          row.reviewedBy || "",
          row.reviewRemark || "",
          row.createdAt instanceof Date ? row.createdAt.toISOString() : "",
          row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : "",
          normalizeInt(row.totalGrantedPoints, 0),
        ]
          .map((v) => this.csvEscape(v))
          .join(","),
      );
    }
    return {
      csv: `\uFEFF${lines.join("\n")}`,
      exportedCount: rows.length,
    };
  }
}
