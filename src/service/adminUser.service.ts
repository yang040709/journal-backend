import User, { IUser } from "../model/User";
import type { IActivity } from "../model/Activity";
import Note from "../model/Note";
import NoteBook from "../model/NoteBook";
import Reminder from "../model/Reminder";
import Template from "../model/Template";
import Activity from "../model/Activity";
import UserAdRewardLog from "../model/UserAdRewardLog";
import PointsLedger from "../model/PointsLedger";
import UserUploadQuotaDaily from "../model/UserUploadQuotaDaily";
import UserAiUsageDaily from "../model/UserAiUsageDaily";
import UserFeedback from "../model/UserFeedback";
import ShareSecurityTask from "../model/ShareSecurityTask";
import { getAiDailyBaseLimit } from "./aiUsageQuota";
import { getUploadDailyBaseLimit } from "./upload.service";
import { getQuotaDateContext } from "../utils/dateKey";
import { CoverService } from "./cover.service";
import { UserService } from "./user.service";
import { PointsService } from "./points.service";
import { LeanActivity } from "../types/mongoose";
import { toLeanActivityArray } from "../utils/typeUtils";
import { UserPurgeService } from "./userPurge.service";
import { signToken } from "../utils/jwt";

type LeanUserRow = {
  _id: { toString: () => string };
  userId: string;
  nickname?: string;
  avatarUrl?: string;
  points?: number;
  adRewardDailyLimit?: number | null;
  aiBonusQuota?: number;
  uploadExtraQuotaTotal?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export type AdminUserListItem = ReturnType<typeof AdminUserService.serializeUser> & {
  aiUsedToday?: number;
  aiDailyLimit?: number;
  aiRemainingToday?: number;
  uploadUsedToday?: number;
  uploadTotalLimitToday?: number;
  uploadRemainingToday?: number;
  quotaDateKey?: string;
};

export class AdminUserService {
  static async generateUserJwtByBizUserId(rawBizUserId: string): Promise<{
    userId: string;
    token: string;
    bearerToken: string;
    expiresIn: string;
  } | null> {
    const bizUserId = AdminUserService.decodeBizUserIdParam(rawBizUserId);
    if (!bizUserId) {
      return null;
    }
    const user = await User.findOne({ userId: bizUserId }).select("userId").lean();
    if (!user?.userId) {
      return null;
    }
    const token = signToken({ userId: user.userId });
    return {
      userId: user.userId,
      token,
      bearerToken: `Bearer ${token}`,
      expiresIn: "7d",
    };
  }

  static buildHealthScoreSummary(input: {
    activityCount7d: number;
    noteCount30d: number;
    feedbackPending: number;
    feedbackImportantPending: number;
    riskRejectCount30d: number;
    riskSuspiciousCount30d: number;
    pointsIncome30d: number;
    pointsExpense30d: number;
  }) {
    const reasons: string[] = [];

    const activity = Number(input.activityCount7d || 0);
    const content = Number(input.noteCount30d || 0);
    const pending = Number(input.feedbackPending || 0);
    const importantPending = Number(input.feedbackImportantPending || 0);
    const riskReject = Number(input.riskRejectCount30d || 0);
    const riskSuspicious = Number(input.riskSuspiciousCount30d || 0);
    const income30d = Number(input.pointsIncome30d || 0);
    const expense30d = Number(input.pointsExpense30d || 0);

    let activeScore = 6;
    if (activity >= 20) {
      activeScore = 30;
    } else if (activity >= 10) {
      activeScore = 22;
    } else if (activity >= 3) {
      activeScore = 14;
    }
    if (activeScore < 22) {
      reasons.push(`近7天活跃偏低（${activity}次）`);
    }

    let contentScore = 4;
    if (content >= 15) {
      contentScore = 25;
    } else if (content >= 8) {
      contentScore = 18;
    } else if (content >= 3) {
      contentScore = 10;
    }
    if (contentScore < 18) {
      reasons.push(`近30天内容产出偏少（${content}篇）`);
    }

    let feedbackScore = Math.max(0, 20 - pending * 4);
    if (importantPending > 0) {
      feedbackScore = Math.max(0, feedbackScore - 6);
      reasons.push(`存在重要待处理反馈（${importantPending}条）`);
    } else if (pending > 0) {
      reasons.push(`待处理反馈较多（${pending}条）`);
    }

    let riskScore = 15;
    if (riskReject > 0) {
      riskScore = 2;
      reasons.push(`近30天存在拦截风控记录（${riskReject}次）`);
    } else if (riskSuspicious > 0) {
      riskScore = 8;
      reasons.push(`近30天存在可疑风控记录（${riskSuspicious}次）`);
    }

    let pointsScore = 3;
    if (income30d > 0 && expense30d > 0) {
      pointsScore = 10;
    } else if (income30d > 0 || expense30d > 0) {
      pointsScore = 6;
    }
    if (pointsScore < 10) {
      reasons.push("近30天积分行为较少");
    }

    const total = Math.max(0, Math.min(100, activeScore + contentScore + feedbackScore + riskScore + pointsScore));
    const level = total >= 80 ? "A" : total >= 60 ? "B" : total >= 40 ? "C" : "D";

    return {
      total,
      level,
      dimensions: {
        active: { score: activeScore, max: 30 },
        content: { score: contentScore, max: 25 },
        feedback: { score: feedbackScore, max: 20 },
        risk: { score: riskScore, max: 15 },
        points: { score: pointsScore, max: 10 },
      },
      reasons: reasons.slice(0, 3),
    };
  }

  static async listUsers(
    page = 1,
    limit = 20,
    userId?: string,
    createdAtFrom?: number,
    createdAtTo?: number,
  ): Promise<{ items: AdminUserListItem[]; total: number }> {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    const skip = (p - 1) * l;
    const q: Record<string, unknown> = {};
    if (userId?.trim()) {
      q.userId = userId.trim();
    }
    if (createdAtFrom != null || createdAtTo != null) {
      const createdAt: Record<string, Date> = {};
      if (createdAtFrom != null) {
        createdAt.$gte = new Date(createdAtFrom);
      }
      if (createdAtTo != null) {
        createdAt.$lte = new Date(createdAtTo);
      }
      q.createdAt = createdAt;
    }
    const [rows, total] = await Promise.all([
      User.find(q).sort({ updatedAt: -1 }).skip(skip).limit(l).lean(),
      User.countDocuments(q),
    ]);
    const items = await AdminUserService.attachTodayQuota(rows as LeanUserRow[]);
    return {
      items,
      total,
    };
  }

  /** 为列表批量附加当日 AI / 上传额度摘要（与 C 端额度逻辑一致） */
  static async attachTodayQuota(users: LeanUserRow[]): Promise<AdminUserListItem[]> {
    if (users.length === 0) {
      return [];
    }
    const { dateKey } = getQuotaDateContext();
    const userIds = users.map((u) => u.userId);
    const [aiRows, uploadRows] = await Promise.all([
      UserAiUsageDaily.find({ userId: { $in: userIds }, dateKey })
        .select("userId usedCount")
        .lean(),
      UserUploadQuotaDaily.find({ userId: { $in: userIds }, dateKey })
        .select("userId usedCount")
        .lean(),
    ]);
    const aiByUser = new Map(aiRows.map((r) => [r.userId, r.usedCount ?? 0]));
    const uploadByUser = new Map(uploadRows.map((r) => [r.userId, r.usedCount ?? 0]));
    const [uploadBase, aiBase] = await Promise.all([
      getUploadDailyBaseLimit(),
      getAiDailyBaseLimit(),
    ]);

    return users.map((user) => {
      const base = AdminUserService.serializeUser(user);
      const aiDailyLimit = aiBase + (user.aiBonusQuota ?? 0);
      const aiUsedToday = aiByUser.get(user.userId) ?? 0;
      const extra = Math.max(0, Math.floor(Number(user.uploadExtraQuotaTotal ?? 0)));
      const uploadTotalLimitToday = Math.max(0, uploadBase + extra);
      const uploadUsedToday = uploadByUser.get(user.userId) ?? 0;
      return {
        ...base,
        quotaDateKey: dateKey,
        aiUsedToday,
        aiDailyLimit,
        aiRemainingToday: Math.max(0, aiDailyLimit - aiUsedToday),
        uploadUsedToday,
        uploadTotalLimitToday,
        uploadRemainingToday: Math.max(0, uploadTotalLimitToday - uploadUsedToday),
      };
    });
  }

  static serializeUser(user: LeanUserRow) {
    const pts = user.points;
    return {
      id: user._id.toString(),
      userId: user.userId,
      nickname: String(user.nickname ?? "").trim(),
      avatarUrl: String(user.avatarUrl ?? "").trim(),
      points: pts === undefined || pts === null ? 200 : Math.max(0, Math.floor(Number(pts))),
      adRewardDailyLimit:
        typeof user.adRewardDailyLimit === "number" && user.adRewardDailyLimit >= 1
          ? user.adRewardDailyLimit
          : null,
      aiBonusQuota: user.aiBonusQuota ?? 0,
      uploadExtraQuotaTotal: user.uploadExtraQuotaTotal ?? 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  static async getUserById(id: string) {
    const user = await User.findById(id).lean();
    if (!user) {
      return null;
    }
    return AdminUserService.serializeUser(user);
  }

  /** 管理端路由 `:id` 仅为业务 userId；解码后按 userId 查库 */
  static decodeBizUserIdParam(raw: string): string {
    const t = String(raw ?? "").trim();
    if (!t) {
      return "";
    }
    try {
      return decodeURIComponent(t).trim();
    } catch {
      return t;
    }
  }

  /** 将路由中的业务 userId 解析为 User 文档 MongoDB `_id` */
  static async resolveMongoIdFromBizUserRouteParam(
    raw: string,
  ): Promise<string | null> {
    const biz = AdminUserService.decodeBizUserIdParam(raw);
    if (!biz) {
      return null;
    }
    const user = await User.findOne({ userId: biz }).select("_id").lean();
    return user ? user._id.toString() : null;
  }

  /** 管理端分页查询某用户的 Activity（mongoUserId 为 User._id） */
  static async listUserActivities(
    mongoUserId: string,
    params: {
      page: number;
      limit: number;
      type?: IActivity["type"];
      target?: IActivity["target"];
    },
  ): Promise<{ items: LeanActivity[]; total: number; page: number; limit: number } | null> {
    const user = await User.findById(mongoUserId).select("userId").lean();
    if (!user) {
      return null;
    }
    const bizUserId = String((user as { userId?: string }).userId || "").trim();
    if (!bizUserId) {
      return null;
    }
    const page = Math.max(1, params.page);
    const limit = Math.min(100, Math.max(1, params.limit));
    const skip = (page - 1) * limit;

    const q: Record<string, unknown> = { userId: bizUserId };
    if (params.type) {
      q.type = params.type;
    }
    if (params.target) {
      q.target = params.target;
    }

    const [docs, total] = await Promise.all([
      Activity.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Activity.countDocuments(q),
    ]);

    return {
      items: toLeanActivityArray(docs),
      total,
      page,
      limit,
    };
  }

  /** 管理端分页查询全站 Activity；可选按业务 userId / type / target 缩小范围 */
  static async listAllActivities(params: {
    page: number;
    limit: number;
    userId?: string;
    type?: IActivity["type"];
    target?: IActivity["target"];
  }): Promise<{ items: LeanActivity[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page);
    const limit = Math.min(100, Math.max(1, params.limit));
    const skip = (page - 1) * limit;

    const q: Record<string, unknown> = {};
    const uid = params.userId?.trim();
    if (uid) {
      q.userId = uid;
    }
    if (params.type) {
      q.type = params.type;
    }
    if (params.target) {
      q.target = params.target;
    }

    const [docs, total] = await Promise.all([
      Activity.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Activity.countDocuments(q),
    ]);

    return {
      items: toLeanActivityArray(docs),
      total,
      page,
      limit,
    };
  }

  static async getUserByUserId(userId: string) {
    const user = await User.findOne({ userId }).lean();
    if (!user) {
      return null;
    }
    return AdminUserService.serializeUser(user);
  }

  /** 管理端用户 360°：聚合只读信息，一次请求返回 */
  static async getUserOverview(mongoId: string) {
    const user = await User.findById(mongoId).lean();
    if (!user) {
      return null;
    }
    const row = user as unknown as LeanUserRow;
    const bizUserId = row.userId;
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const [
      userWithQuota,
      recentNotes,
      recentNotebooks,
      reminderCount,
      templateCount,
      totalNotes,
      sharedNotes,
      favoriteNotes,
      totalNotebooks,
      lastActivity,
      activityCount7d,
      feedbackTotal,
      feedbackPending,
      feedbackImportantOrCritical,
      lastFeedback,
      pointsIncome30dRows,
      pointsExpense30dRows,
      lastPointsChange,
      noteCount30d,
      riskRejectCount30d,
      riskSuspiciousCount30d,
    ] = await Promise.all([
      AdminUserService.attachTodayQuota([row]).then((r) => r[0]),
      Note.find({ userId: bizUserId })
        .sort({ updatedAt: -1 })
        .limit(8)
        .select("title updatedAt")
        .lean(),
      NoteBook.find({ userId: bizUserId })
        .sort({ updatedAt: -1 })
        .limit(8)
        .select("title count updatedAt")
        .lean(),
      Reminder.countDocuments({ userId: bizUserId }),
      Template.countDocuments({ userId: bizUserId }),
      Note.countDocuments({ userId: bizUserId, isDeleted: false }),
      Note.countDocuments({ userId: bizUserId, isDeleted: false, isShare: true }),
      Note.countDocuments({ userId: bizUserId, isDeleted: false, isFavorite: true }),
      NoteBook.countDocuments({ userId: bizUserId }),
      Activity.findOne({ userId: bizUserId }).sort({ createdAt: -1 }).select("type title createdAt").lean(),
      Activity.countDocuments({ userId: bizUserId, createdAt: { $gte: sevenDaysAgo } }),
      UserFeedback.countDocuments({ userId: bizUserId }),
      UserFeedback.countDocuments({ userId: bizUserId, status: "pending" }),
      UserFeedback.countDocuments({
        userId: bizUserId,
        reviewLevel: { $in: ["important", "critical"] },
      }),
      UserFeedback.findOne({ userId: bizUserId }).sort({ createdAt: -1 }).select("createdAt").lean(),
      PointsLedger.aggregate<{ total: number }>([
        {
          $match: {
            userId: bizUserId,
            flowType: "income",
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: { _id: null, total: { $sum: "$pointsDelta" } },
        },
      ]),
      PointsLedger.aggregate<{ total: number }>([
        {
          $match: {
            userId: bizUserId,
            flowType: "expense",
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: { _id: null, total: { $sum: { $abs: "$pointsDelta" } } },
        },
      ]),
      PointsLedger.findOne({ userId: bizUserId })
        .sort({ createdAt: -1 })
        .select("createdAt")
        .lean(),
      Note.countDocuments({
        userId: bizUserId,
        isDeleted: false,
        createdAt: { $gte: thirtyDaysAgo },
      }),
      ShareSecurityTask.countDocuments({
        userId: bizUserId,
        createdAt: { $gte: thirtyDaysAgo },
        status: { $in: ["reject_local", "reject_wechat"] },
      }),
      ShareSecurityTask.countDocuments({
        userId: bizUserId,
        createdAt: { $gte: thirtyDaysAgo },
        status: "risky_wechat",
      }),
    ]);
    const quickCovers = Array.isArray((user as { quickCovers?: unknown }).quickCovers)
      ? ((user as { quickCovers: string[] }).quickCovers || []).slice(0, 8)
      : [];
    const pointsIncome30d = Math.max(0, Math.floor(Number(pointsIncome30dRows[0]?.total ?? 0)));
    const pointsExpense30d = Math.max(0, Math.floor(Number(pointsExpense30dRows[0]?.total ?? 0)));
    const healthScore = AdminUserService.buildHealthScoreSummary({
      activityCount7d,
      noteCount30d,
      feedbackPending,
      feedbackImportantPending: feedbackImportantOrCritical,
      riskRejectCount30d,
      riskSuspiciousCount30d,
      pointsIncome30d,
      pointsExpense30d,
    });

    const reminderSafe = Math.max(0, Math.floor(Number(reminderCount || 0)));
    const templateSafe = Math.max(0, Math.floor(Number(templateCount || 0)));

    return {
      user: userWithQuota,
      healthScore,
      profileSummary: {
        nickname: String((user as { nickname?: string }).nickname || ""),
        avatarUrl: String((user as { avatarUrl?: string }).avatarUrl || ""),
        bio: String((user as { bio?: string }).bio || ""),
        membershipText: String((user as { membershipText?: string }).membershipText || ""),
        customTagCount: Array.isArray((user as { customNoteTags?: unknown[] }).customNoteTags)
          ? (user as { customNoteTags: unknown[] }).customNoteTags.length
          : 0,
        customCoverCount: Array.isArray((user as { customCovers?: unknown[] }).customCovers)
          ? (user as { customCovers: unknown[] }).customCovers.length
          : 0,
      },
      activitySummary: {
        lastActivityAt: lastActivity?.createdAt ?? null,
        lastActivityType: lastActivity?.type ?? "",
        lastActivityTitle: lastActivity?.title ?? "",
        activityCount7d,
      },
      contentSummary: {
        totalNotes,
        sharedNotes,
        favoriteNotes,
        totalNotebooks,
      },
      feedbackSummary: {
        feedbackTotal,
        feedbackPending,
        feedbackImportantOrCritical,
        lastFeedbackAt: lastFeedback?.createdAt ?? null,
      },
      pointsSummary: {
        pointsIncome30d,
        pointsExpense30d,
        lastPointsChangeAt: lastPointsChange?.createdAt ?? null,
      },
      recentNotes: recentNotes.map((n) => ({
        id: n._id.toString(),
        title: n.title,
        updatedAt: n.updatedAt,
      })),
      recentNotebooks: recentNotebooks.map((nb) => ({
        id: nb._id.toString(),
        title: nb.title,
        count: nb.count,
        updatedAt: nb.updatedAt,
      })),
      reminderCount: reminderSafe,
      templateCount: templateSafe,
      quickCoverPreviewUrls: quickCovers,
    };
  }

  static async createUser(data: {
    userId: string;
    initDefaultNoteBooks?: boolean;
  }): Promise<IUser> {
    const userId = data.userId.trim();
    if (!userId) {
      throw new Error("userId 不能为空");
    }
    const exists = await User.findOne({ userId });
    if (exists) {
      throw new Error("用户已存在");
    }
    const sysCovers = await CoverService.getSystemCovers();
    const user = await User.create({
      userId,
      points: 200,
      quickCovers: sysCovers.slice(0, 11),
      quickCoversUpdatedAt: new Date(),
    });
    if (data.initDefaultNoteBooks !== false) {
      await UserService.createDefaultNoteBooks(userId);
    }
    return user;
  }

  static async updateUser(
    id: string,
    data: {
      aiBonusQuota?: number;
      uploadExtraQuotaTotal?: number;
      points?: number;
      pointsAdjustReason?: string;
      adRewardDailyLimit?: number | null;
    },
    admin: { id: string; username: string },
  ): Promise<IUser | null> {
    let user = await User.findById(id);
    if (!user) {
      return null;
    }
    if (data.points !== undefined) {
      const reason = (data.pointsAdjustReason || "").trim() || "后台调整";
      await PointsService.adminSetPoints(user.userId, data.points, reason, admin);
    }
    user = await User.findById(id);
    if (!user) {
      return null;
    }
    if (data.aiBonusQuota !== undefined) {
      user.aiBonusQuota = Math.max(0, data.aiBonusQuota);
    }
    if (data.uploadExtraQuotaTotal !== undefined) {
      user.uploadExtraQuotaTotal = Math.max(0, data.uploadExtraQuotaTotal);
    }
    if (data.adRewardDailyLimit === null) {
      user.set("adRewardDailyLimit", undefined);
    } else if (data.adRewardDailyLimit !== undefined) {
      user.adRewardDailyLimit = data.adRewardDailyLimit;
    }
    await user.save();
    return user;
  }

  static async deleteUserById(id: string): Promise<boolean> {
    const r = await UserPurgeService.purgeByMongoUserId(id, {
      dryRun: false,
      verify: false,
      withCos: false,
      useTransactionIfPossible: true,
    });
    return Boolean(r);
  }
}
