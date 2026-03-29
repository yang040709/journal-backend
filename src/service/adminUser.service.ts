import User, { IUser } from "../model/User";
import Note from "../model/Note";
import NoteBook from "../model/NoteBook";
import Reminder from "../model/Reminder";
import Template from "../model/Template";
import Activity from "../model/Activity";
import UserAdRewardLog from "../model/UserAdRewardLog";
import UserUploadQuotaDaily from "../model/UserUploadQuotaDaily";
import UserAiUsageDaily from "../model/UserAiUsageDaily";
import { getAiDailyBaseLimit } from "./aiUsageQuota";
import { getUploadDailyBaseLimit } from "./upload.service";
import { getQuotaDateContext } from "../utils/dateKey";
import { CoverService } from "./cover.service";
import { UserService } from "./user.service";

type LeanUserRow = {
  _id: { toString: () => string };
  userId: string;
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
    const uploadBase = getUploadDailyBaseLimit();

    return users.map((user) => {
      const base = AdminUserService.serializeUser(user);
      const aiDailyLimit = getAiDailyBaseLimit() + (user.aiBonusQuota ?? 0);
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
    return {
      id: user._id.toString(),
      userId: user.userId,
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
    data: { aiBonusQuota?: number; uploadExtraQuotaTotal?: number },
  ): Promise<IUser | null> {
    const user = await User.findById(id);
    if (!user) {
      return null;
    }
    if (data.aiBonusQuota !== undefined) {
      user.aiBonusQuota = Math.max(0, data.aiBonusQuota);
    }
    if (data.uploadExtraQuotaTotal !== undefined) {
      user.uploadExtraQuotaTotal = Math.max(0, data.uploadExtraQuotaTotal);
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
      UserUploadQuotaDaily.deleteMany({ userId }),
      UserAiUsageDaily.deleteMany({ userId }),
    ]);
    await User.deleteOne({ _id: id });
    return true;
  }
}
