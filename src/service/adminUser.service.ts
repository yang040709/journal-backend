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
import { getAiDailyBaseLimit } from "./aiUsageQuota";
import { getUploadDailyBaseLimit } from "./upload.service";
import { getQuotaDateContext } from "../utils/dateKey";
import { CoverService } from "./cover.service";
import { UserService } from "./user.service";
import { PointsService } from "./points.service";
import { LeanActivity } from "../types/mongoose";
import { toLeanActivityArray } from "../utils/typeUtils";

type LeanUserRow = {
  _id: { toString: () => string };
  userId: string;
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
    const [
      userWithQuota,
      recentNotes,
      recentNotebooks,
      reminderCount,
      templateCount,
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
    ]);
    const quickCovers = Array.isArray((user as { quickCovers?: unknown }).quickCovers)
      ? ((user as { quickCovers: string[] }).quickCovers || []).slice(0, 8)
      : [];
    return {
      user: userWithQuota,
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
      reminderCount,
      templateCount,
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
    const user = await User.findById(id).lean();
    if (!user) {
      return false;
    }
    const userId = user.userId;
    await Promise.all([
      Note.deleteMany({ userId }),
      NoteBook.deleteMany({ userId }),
      Reminder.deleteMany({ userId }),
      Template.deleteMany({ userId }),
      Activity.deleteMany({ userId }),
      UserAdRewardLog.deleteMany({ userId }),
      PointsLedger.deleteMany({ userId }),
      UserUploadQuotaDaily.deleteMany({ userId }),
      UserAiUsageDaily.deleteMany({ userId }),
    ]);
    await User.deleteOne({ _id: id });
    return true;
  }
}
