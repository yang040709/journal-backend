import axios from "axios";
import User from "../model/User";
import NoteBook from "../model/NoteBook";
import Note from "../model/Note";
import { signToken } from "../utils/jwt";
import {
  formatInstantAsDateKey,
  getQuotaDateContext,
  previousDateKey,
} from "../utils/dateKey";
import { ActivityLogger } from "../utils/ActivityLogger";
import { CoverService } from "./cover.service";
import { InitialUserNotebookConfigService } from "./initialUserNotebookConfig.service";
import { InitialUserNoteSeedConfigService } from "./initialUserNoteSeedConfig.service";
import { nanoid } from "nanoid";

export interface LoginResult {
  token: string;
  userId: string;
}

export interface MePageProfile {
  userId: string;
  nickname: string;
  avatarUrl: string;
  bio: string;
  membershipText: string;
}

export interface MePageStats {
  notebookCount: number;
  noteCount: number;
  streakDays: number;
}

export interface UpdateMeProfileInput {
  nickname?: string;
  avatarUrl?: string;
  bio?: string;
}

export class UserService {
  private static buildDefaultNickname(userId: string): string {
    const normalized = String(userId || "").trim();
    if (!normalized) return "手帐用户";
    const suffix = normalized.slice(-4);
    return `手帐用户${suffix}`;
  }

  /**
   * 用户登录 - 优化版本
   */
  static async login(code: string): Promise<LoginResult> {
    try {
      // 1. 获取微信openid
      const openid = await this.fetchWechatOpenId(code);

      // 2. 使用findOneAndUpdate实现查找或创建用户（原子操作）
      // 先尝试查找用户
      let user = await User.findOne({ userId: openid });
      let isNewUser = false;

      if (user) {
        // 用户已存在，直接使用
        isNewUser = false;
      } else {
        // 用户不存在，创建新用户
        const sysCovers = await CoverService.getSystemCovers();
        user = await User.create({
          userId: openid,
          quickCovers: sysCovers.slice(0, 11),
          quickCoversUpdatedAt: new Date(),
        });
        isNewUser = true;
        // 为新用户异步创建默认手帐本（不阻塞登录响应）
        await this.createDefaultNoteBooks(openid).catch((error) => {
          console.error("创建默认手帐本失败（不影响登录）:", error);
        });
      }

      // 4. 异步记录活动日志（不阻塞登录响应）
      void ActivityLogger.record(
        {
          type: isNewUser ? "create" : "update",
          target: "noteBook",
          targetId: user.id,
          title: isNewUser ? "新用户注册" : "用户登录",
          userId: user.userId,
        },
        { blocking: false },
      );

      // 5. 等待token生成完成
      const token = signToken({ userId: user.userId });

      // 6. 不等待活动记录完成，直接返回响应
      // activityPromise会在后台完成

      return {
        token,
        userId: user.userId,
      };
    } catch (error) {
      console.error("用户登录失败:", error);
      if (error instanceof Error) {
        throw new Error(`登录失败：${error.message}`);
      }
      throw new Error("登录失败：未知错误");
    }
  }

  /**
   * 调用微信接口获取openid（带超时和重试）
   */
  private static async fetchWechatOpenId(code: string): Promise<string> {
    try {
      const response = await axios({
        method: "get",
        url: "https://api.weixin.qq.com/sns/jscode2session",
        params: {
          js_code: code,
          appid: process.env.WX_APPID,
          secret: process.env.WX_SECRET,
          grant_type: "authorization_code",
        },
        timeout: 5000, // 5秒超时
      });

      if (!response.data || !response.data.openid) {
        throw new Error("微信登录失败：未获取到 openid");
      }

      return response.data.openid;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          throw new Error("微信接口请求超时，请稍后重试");
        }
        if (error.response) {
          throw new Error(
            `微信接口错误: ${error.response.status} ${error.response.statusText}`,
          );
        }
      }
      throw error;
    }
  }

  /**
   * 为新用户创建默认手帐本（登录注册与后台「新增用户」均可调用）
   */
  static async createDefaultNoteBooks(userId: string): Promise<void> {
    try {
      const templates =
        await InitialUserNotebookConfigService.resolveTemplatesForNewUser();
      const noteBooks = templates.map((noteBook) => ({
        title: noteBook.title,
        coverImg: noteBook.coverImg,
        count: 0,
        userId,
      }));

      const insertedNoteBooks = await NoteBook.insertMany(noteBooks);
      console.log(
        `✅ 为用户 ${userId} 创建了 ${noteBooks.length} 个默认手帐本`,
      );

      const noteSeedTemplates =
        await InitialUserNoteSeedConfigService.resolveTemplatesForNewUser();
      const usable = noteSeedTemplates.filter(
        (t) =>
          Number.isInteger(t.targetIndex) &&
          t.targetIndex >= 0 &&
          t.targetIndex < insertedNoteBooks.length,
      );
      if (usable.length === 0) {
        return;
      }

      const seedKeys = usable
        .map((t) => String(t.seedKey || "").trim())
        .filter(Boolean);
      if (seedKeys.length === 0) {
        return;
      }

      const existing = await Note.find({
        userId,
        isDeleted: { $ne: true },
        appliedSystemTemplateKey: { $in: seedKeys },
      })
        .select("appliedSystemTemplateKey")
        .lean();
      const existingKeys = new Set(
        existing.map((r) => String((r as any).appliedSystemTemplateKey || "")),
      );

      const notesToInsert = usable
        .filter((t) => !existingKeys.has(String(t.seedKey || "").trim()))
        .map((t) => {
          const nb = insertedNoteBooks[t.targetIndex];
          const noteBookId = String((nb as any).id || (nb as any)._id || "");
          const shouldPin = Boolean(t.isPinned);
          return {
            noteBookId,
            title: t.title,
            content: t.content || "",
            tags: Array.isArray(t.tags) ? t.tags : [],
            images: [],
            userId,
            isShare: false,
            shareId: nanoid(12),
            shareVersion: 0,
            appliedSystemTemplateKey: String(t.seedKey || "").trim().slice(0, 120),
            isDeleted: false,
            deletedAt: null,
            deleteExpireAt: null,
            isPinned: shouldPin,
            pinnedAt: shouldPin ? new Date() : null,
          };
        })
        .filter((n) => n.noteBookId);

      if (notesToInsert.length === 0) {
        return;
      }

      await Note.insertMany(notesToInsert);

      const incByNotebookId = new Map<string, number>();
      for (const n of notesToInsert) {
        incByNotebookId.set(n.noteBookId, (incByNotebookId.get(n.noteBookId) || 0) + 1);
      }
      await NoteBook.bulkWrite(
        Array.from(incByNotebookId.entries()).map(([noteBookId, inc]) => ({
          updateOne: {
            filter: { _id: noteBookId },
            update: { $inc: { count: inc } },
          },
        })),
      );
      console.log(`✅ 为用户 ${userId} 创建了 ${notesToInsert.length} 篇初始手帐`);
    } catch (error) {
      console.error("创建默认手帐本失败:", error);
      // 不抛出错误，避免影响用户登录
    }
  }

  /**
   * 记录客户端以本地 JWT 会话启动（非 code 登录路径），写入活动日志且不阻塞调用方
   */
  static recordClientSession(userId: string): void {
    void ActivityLogger.record(
      {
        type: "session",
        target: "user",
        targetId: userId,
        title: "小程序启动（本地会话）",
        userId,
      },
      { blocking: false },
    );
  }

  /**
   * 获取用户信息
   */
  static async getUserInfo(userId: string) {
    const user = await User.findOne({ userId }).lean();
    if (!user) {
      throw new Error("用户不存在");
    }

    return {
      userId: user.userId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  static async getMeProfile(userId: string): Promise<MePageProfile> {
    const user = await User.findOne({ userId }).lean();
    if (!user) {
      throw new Error("用户不存在");
    }

    return {
      userId: user.userId,
      nickname:
        String((user as any).nickname || "").trim() ||
        UserService.buildDefaultNickname(user.userId),
      avatarUrl: String((user as any).avatarUrl || "").trim(),
      bio: String((user as any).bio || "").trim() || "手帐记录生活点滴",
      membershipText: String((user as any).membershipText || "").trim(),
    };
  }

  static async getMeStats(userId: string): Promise<MePageStats> {
    const user = await User.findOne({ userId }).lean();
    if (!user) {
      throw new Error("用户不存在");
    }

    const [notebookCount, noteCount, noteDates] = await Promise.all([
      NoteBook.countDocuments({ userId, isDeleted: { $ne: true } }),
      Note.countDocuments({ userId, isDeleted: { $ne: true } }),
      Note.find({ userId, isDeleted: { $ne: true } })
        .select("createdAt")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const streakDays = UserService.calculateStreakDays(
      noteDates.map((item) => new Date(item.createdAt)),
    );

    return {
      notebookCount,
      noteCount,
      streakDays,
    };
  }

  static async updateMeProfile(
    userId: string,
    input: UpdateMeProfileInput,
  ): Promise<MePageProfile> {
    const updatePayload: Partial<UpdateMeProfileInput> = {};
    if (input.nickname !== undefined) {
      updatePayload.nickname = String(input.nickname).trim();
    }
    if (input.avatarUrl !== undefined) {
      updatePayload.avatarUrl = String(input.avatarUrl).trim();
    }
    if (input.bio !== undefined) {
      updatePayload.bio = String(input.bio).trim();
    }

    if (Object.keys(updatePayload).length === 0) {
      const current = await this.getUserInfo(userId);
      const user = await User.findOne({ userId }).lean();
      return {
        userId: current.userId,
        nickname:
          String((user as any)?.nickname || "").trim() ||
          UserService.buildDefaultNickname(current.userId),
        avatarUrl: String((user as any)?.avatarUrl || "").trim(),
        bio: String((user as any)?.bio || "").trim() || "手帐记录生活点滴",
        membershipText: String((user as any)?.membershipText || "").trim(),
      };
    }

    const user = await User.findOneAndUpdate(
      { userId },
      { $set: updatePayload },
      { new: true },
    ).lean();

    if (!user) {
      throw new Error("用户不存在");
    }

    return {
      userId: user.userId,
      nickname:
        String((user as any).nickname || "").trim() ||
        UserService.buildDefaultNickname(user.userId),
      avatarUrl: String((user as any).avatarUrl || "").trim(),
      bio: String((user as any).bio || "").trim() || "手帐记录生活点滴",
      membershipText: String((user as any).membershipText || "").trim(),
    };
  }

  /**
   * 验证用户是否存在
   */
  static async validateUser(userId: string): Promise<boolean> {
    const user = await User.findOne({ userId });
    return !!user;
  }

  /**
   * 连续记录天数：按业务时区（与额度自然日一致）分桶；
   * 从「不超过今天的、最近一条有记录的自然日」起向前数连续有记录的自然日。
   * 例：今日 12 号且 10、11 有记、12 未记 → 2；12 号也记了 → 3。
   */
  private static calculateStreakDays(dates: Date[]): number {
    if (!Array.isArray(dates) || dates.length === 0) return 0;
    const { timezone } = getQuotaDateContext();
    const dateSet = new Set<string>();
    for (const date of dates) {
      dateSet.add(formatInstantAsDateKey(new Date(date.getTime()), timezone));
    }

    const todayKey = formatInstantAsDateKey(new Date(), timezone);
    let anchorKey = "";
    for (const key of dateSet) {
      if (key > todayKey) continue;
      if (key > anchorKey) anchorKey = key;
    }
    if (!anchorKey) return 0;

    let streak = 0;
    let cursorKey = anchorKey;
    for (let i = 0; i < 3660; i += 1) {
      if (!dateSet.has(cursorKey)) break;
      streak += 1;
      const prevKey = previousDateKey(cursorKey, timezone);
      if (prevKey === cursorKey) break;
      cursorKey = prevKey;
    }
    return streak;
  }
}
