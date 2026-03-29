import User from "../model/User";
import SystemConfig, { SYSTEM_CONFIG_COVERS_KEY } from "../model/SystemConfig";
import { coverPreviewList } from "../constant/img";
import { ActivityLogger } from "../utils/ActivityLogger";
import { recordFromCover } from "./userImageAsset.service";

export interface UpdateQuickCoversData {
  covers: string[];
}

export interface UserCustomCoverItem {
  id: string;
  coverUrl: string;
  thumbUrl?: string;
  thumbKey?: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface AddUserCustomCoverInput {
  coverUrl: string;
  thumbUrl?: string;
  thumbKey?: string;
}

export interface UpdateUserCustomCoverInput {
  coverUrl: string;
  thumbUrl?: string;
  thumbKey?: string;
}

/** 与 C 端、后台运营接口共用上限 */
export const COVER_MAX_QUICK_COUNT = 11;
export const COVER_MAX_CUSTOM_COVER_COUNT = 20;

function maxSystemCovers(): number {
  const n = Number(process.env.MAX_SYSTEM_COVERS);
  if (Number.isFinite(n) && n >= 1) {
    return Math.min(500, n);
  }
  return 120;
}

export class CoverService {
  private static readonly MAX_CUSTOM_COVER_COUNT = COVER_MAX_CUSTOM_COVER_COUNT;

  static normalizeCustomCoverItem(item: any): UserCustomCoverItem {
    const thumbUrl = item?.thumbUrl != null ? String(item.thumbUrl).trim() : "";
    const thumbKey = item?.thumbKey != null ? String(item.thumbKey).trim() : "";
    return {
      id: String(item?._id || ""),
      coverUrl: String(item?.coverUrl || ""),
      ...(thumbUrl ? { thumbUrl } : {}),
      ...(thumbKey ? { thumbKey } : {}),
      createdAt: item?.createdAt ? new Date(item.createdAt) : null,
      updatedAt: item?.updatedAt ? new Date(item.updatedAt) : null,
    };
  }

  /**
   * 获取系统默认封面列表（优先数据库，空库时用常量并写入种子）
   */
  static async getSystemCovers(): Promise<string[]> {
    let doc = await SystemConfig.findOne({ configKey: SYSTEM_CONFIG_COVERS_KEY });
    if (!doc) {
      await SystemConfig.create({
        configKey: SYSTEM_CONFIG_COVERS_KEY,
        coverUrls: [...coverPreviewList],
      });
      doc = await SystemConfig.findOne({ configKey: SYSTEM_CONFIG_COVERS_KEY });
    }
    if (!doc?.coverUrls?.length) {
      const fallback = [...coverPreviewList];
      if (doc) {
        doc.coverUrls = fallback;
        await doc.save();
      }
      return fallback;
    }
    return [...doc.coverUrls];
  }

  /**
   * 超级管理员配置系统封面全量列表
   */
  static async setSystemCovers(urls: string[]): Promise<{
    coverUrls: string[];
    updatedAt: Date;
  }> {
    const max = maxSystemCovers();
    const trimmed = urls.map((u) => String(u || "").trim()).filter(Boolean);
    if (trimmed.length < 1) {
      throw new Error("系统封面至少配置一条");
    }
    if (trimmed.length > max) {
      throw new Error(`系统封面最多 ${max} 条`);
    }
    for (const u of trimmed) {
      if (!/^https?:\/\//i.test(u)) {
        throw new Error(`系统封面须为 http(s) URL：${u}`);
      }
    }
    const doc = await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_COVERS_KEY },
      { $set: { coverUrls: trimmed } },
      { new: true, upsert: true },
    );
    if (!doc) {
      throw new Error("保存系统封面失败");
    }
    return {
      coverUrls: [...doc.coverUrls],
      updatedAt: doc.updatedAt!,
    };
  }

  /** 管理端读取：含更新时间 */
  static async getSystemCoversForAdmin(): Promise<{
    coverUrls: string[];
    updatedAt: string | null;
  }> {
    const coverUrls = await CoverService.getSystemCovers();
    const doc = await SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_COVERS_KEY,
    }).lean();
    return {
      coverUrls,
      updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
  }

  /**
   * 获取用户快捷封面列表
   * 如果用户没有设置，则返回默认的前11个封面
   */
  static async getUserQuickCovers(userId: string): Promise<string[]> {
    const user = await User.findOne({ userId }).lean();

    if (!user) {
      throw new Error("用户不存在");
    }

    // 如果用户没有quickCovers字段（旧用户），返回默认值
    if (!user.quickCovers || user.quickCovers.length === 0) {
      const sys = await CoverService.getSystemCovers();
      return sys.slice(0, 11);
    }

    return user.quickCovers;
  }

  /**
   * 更新用户快捷封面列表
   * 验证封面数量：1-11个
   */
  static async updateUserQuickCovers(
    userId: string,
    data: UpdateQuickCoversData,
  ): Promise<{ quickCovers: string[]; quickCoversUpdatedAt: Date }> {
    const { covers } = data;

    // 验证封面数量
    if (
      covers.length < 1 ||
      covers.length > COVER_MAX_QUICK_COUNT
    ) {
      throw new Error(
        `快捷封面数量必须在1到${COVER_MAX_QUICK_COUNT}个之间`,
      );
    }

    const user = await User.findOne({ userId }).select("customCovers").lean();
    if (!user) {
      throw new Error("用户不存在");
    }
    const customCoverUrls = Array.isArray((user as any).customCovers)
      ? (user as any).customCovers
          .map((item: any) => String(item?.coverUrl || "").trim())
          .filter(Boolean)
      : [];
    const systemList = await CoverService.getSystemCovers();
    const allowedCoverSet = new Set([...systemList, ...customCoverUrls]);

    // 验证所有封面都在系统封面或用户自定义封面列表中
    const invalidCovers = covers.filter(
      (cover) => !allowedCoverSet.has(cover),
    );
    if (invalidCovers.length > 0) {
      throw new Error(`无效的封面地址: ${invalidCovers.join(", ")}`);
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId },
      {
        $set: {
          quickCovers: covers,
          quickCoversUpdatedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    ).lean();

    if (!updatedUser) {
      throw new Error("用户不存在");
    }

    // 记录活动
    void ActivityLogger.record(
      {
        type: "update",
        target: "cover",
        targetId: userId,
        title: `更新快捷封面列表：共设置 ${covers.length} 个封面`,
        userId,
      },
      { blocking: false },
    );

    return {
      quickCovers: updatedUser.quickCovers,
      quickCoversUpdatedAt: updatedUser.quickCoversUpdatedAt,
    };
  }

  /**
   * 初始化用户快捷封面（用于旧用户迁移）
   */
  static async initUserQuickCovers(userId: string): Promise<void> {
    const user = await User.findOne({ userId });

    if (!user) {
      throw new Error("用户不存在");
    }

    // 如果用户已经有quickCovers，不进行初始化
    if (user.quickCovers && user.quickCovers.length > 0) {
      return;
    }

    const systemList = await CoverService.getSystemCovers();
    user.quickCovers = systemList.slice(0, 11);
    user.quickCoversUpdatedAt = new Date();
    await user.save();

    // 记录活动
    void ActivityLogger.record(
      {
        type: "create",
        target: "cover",
        targetId: userId,
        title: "初始化快捷封面列表：使用默认封面",
        userId,
      },
      { blocking: false },
    );
  }

  static async getUserCustomCovers(userId: string): Promise<UserCustomCoverItem[]> {
    const user = await User.findOne({ userId }).select("customCovers").lean();
    if (!user) {
      throw new Error("用户不存在");
    }

    const customCovers = Array.isArray((user as any).customCovers)
      ? (user as any).customCovers
      : [];
    return customCovers.map((item: any) => this.normalizeCustomCoverItem(item));
  }

  static async addUserCustomCover(
    userId: string,
    input: string | AddUserCustomCoverInput,
  ): Promise<UserCustomCoverItem[]> {
    const payload: AddUserCustomCoverInput =
      typeof input === "string" ? { coverUrl: input } : input;
    const normalizedCoverUrl = String(payload.coverUrl || "").trim();
    if (!normalizedCoverUrl) {
      throw new Error("封面地址不能为空");
    }
    const thumbUrl = payload.thumbUrl != null ? String(payload.thumbUrl).trim() : "";
    const thumbKey = payload.thumbKey != null ? String(payload.thumbKey).trim() : "";

    const pushDoc: { coverUrl: string; thumbUrl?: string; thumbKey?: string } = {
      coverUrl: normalizedCoverUrl,
    };
    if (thumbUrl) pushDoc.thumbUrl = thumbUrl;
    if (thumbKey) pushDoc.thumbKey = thumbKey;

    const updatedUser = await User.findOneAndUpdate(
      {
        userId,
        "customCovers.19": { $exists: false },
      },
      {
        $push: {
          customCovers: pushDoc,
        },
      },
      { new: true, runValidators: true },
    ).lean();

    if (!updatedUser) {
      const user = await User.findOne({ userId }).select("customCovers").lean();
      if (!user) {
        throw new Error("用户不存在");
      }
      const currentCount = Array.isArray((user as any).customCovers)
        ? (user as any).customCovers.length
        : 0;
      if (currentCount >= this.MAX_CUSTOM_COVER_COUNT) {
        throw new Error(`最多上传 ${this.MAX_CUSTOM_COVER_COUNT} 个自定义封面`);
      }
      throw new Error("新增自定义封面失败");
    }

    void ActivityLogger.record(
      {
        type: "create",
        target: "cover",
        targetId: normalizedCoverUrl,
        title: "新增自定义封面",
        userId,
      },
      { blocking: false },
    );

    const customCovers = Array.isArray((updatedUser as any).customCovers)
      ? (updatedUser as any).customCovers
      : [];
    const matched = [...customCovers]
      .reverse()
      .find((item: any) => String(item?.coverUrl || "").trim() === normalizedCoverUrl);
    if (matched?._id) {
      recordFromCover(userId, String(matched._id), {
        coverUrl: normalizedCoverUrl,
        thumbUrl: thumbUrl || undefined,
        thumbKey: thumbKey || undefined,
      });
    }

    return customCovers.map((item: any) => this.normalizeCustomCoverItem(item));
  }

  static async updateUserCustomCover(
    userId: string,
    coverId: string,
    input: string | UpdateUserCustomCoverInput,
  ): Promise<UserCustomCoverItem[]> {
    const payload: UpdateUserCustomCoverInput =
      typeof input === "string" ? { coverUrl: input } : input;
    const normalizedCoverUrl = String(payload.coverUrl || "").trim();
    if (!coverId) {
      throw new Error("封面ID不能为空");
    }
    if (!normalizedCoverUrl) {
      throw new Error("封面地址不能为空");
    }

    const $set: Record<string, unknown> = {
      "customCovers.$.coverUrl": normalizedCoverUrl,
      "customCovers.$.updatedAt": new Date(),
    };
    const $unset: Record<string, "" | 1> = {};
    if (payload.thumbUrl !== undefined) {
      const t = String(payload.thumbUrl || "").trim();
      if (t) {
        $set["customCovers.$.thumbUrl"] = t;
      } else {
        $unset["customCovers.$.thumbUrl"] = "";
      }
    }
    if (payload.thumbKey !== undefined) {
      const k = String(payload.thumbKey || "").trim();
      if (k) {
        $set["customCovers.$.thumbKey"] = k;
      } else {
        $unset["customCovers.$.thumbKey"] = "";
      }
    }

    const updatePayload: { $set: typeof $set; $unset?: typeof $unset } = { $set };
    if (Object.keys($unset).length) {
      updatePayload.$unset = $unset;
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        userId,
        "customCovers._id": coverId,
      },
      updatePayload,
      { new: true, runValidators: true },
    ).lean();

    if (!updatedUser) {
      throw new Error("自定义封面不存在");
    }

    void ActivityLogger.record(
      {
        type: "update",
        target: "cover",
        targetId: String(coverId),
        title: "更新自定义封面",
        userId,
      },
      { blocking: false },
    );

    const customCovers = Array.isArray((updatedUser as any).customCovers)
      ? (updatedUser as any).customCovers
      : [];
    const updatedDoc = customCovers.find(
      (c: any) => String(c?._id) === String(coverId),
    );
    if (updatedDoc) {
      const tu = updatedDoc.thumbUrl != null ? String(updatedDoc.thumbUrl).trim() : "";
      const tk = updatedDoc.thumbKey != null ? String(updatedDoc.thumbKey).trim() : "";
      recordFromCover(userId, String(coverId), {
        coverUrl: String(updatedDoc.coverUrl || "").trim(),
        ...(tu ? { thumbUrl: tu } : {}),
        ...(tk ? { thumbKey: tk } : {}),
      });
    }

    return customCovers.map((item: any) => this.normalizeCustomCoverItem(item));
  }

  static async deleteUserCustomCover(userId: string, coverId: string): Promise<UserCustomCoverItem[]> {
    if (!coverId) {
      throw new Error("封面ID不能为空");
    }

    const user = await User.findOne({ userId, "customCovers._id": coverId }).lean();
    if (!user) {
      throw new Error("自定义封面不存在");
    }

    const targetCover = Array.isArray((user as any).customCovers)
      ? (user as any).customCovers.find((item: any) => String(item?._id) === String(coverId))
      : null;
    const targetCoverUrl = String(targetCover?.coverUrl || "");
    if (!targetCoverUrl) {
      throw new Error("自定义封面不存在");
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        userId,
        "customCovers._id": coverId,
      },
      {
        $pull: {
          customCovers: { _id: coverId },
          quickCovers: targetCoverUrl,
        },
      },
      { new: true },
    ).lean();

    if (!updatedUser) {
      throw new Error("自定义封面不存在");
    }

    void ActivityLogger.record(
      {
        type: "delete",
        target: "cover",
        targetId: String(coverId),
        title: "删除自定义封面",
        userId,
      },
      { blocking: false },
    );

    const customCovers = Array.isArray((updatedUser as any).customCovers)
      ? (updatedUser as any).customCovers
      : [];
    return customCovers.map((item: any) => this.normalizeCustomCoverItem(item));
  }

  /**
   * 后台运营替换快捷封面：仅校验数量与 http(s) URL，不要求 URL 已在系统/自定义列表中。
   */
  static validateAdminQuickCoversInput(covers: string[]): string[] {
    const trimmed = covers.map((c) => String(c || "").trim()).filter(Boolean);
    if (trimmed.length < 1 || trimmed.length > COVER_MAX_QUICK_COUNT) {
      throw new Error(
        `快捷封面数量必须在1到${COVER_MAX_QUICK_COUNT}个之间`,
      );
    }
    for (const u of trimmed) {
      if (!/^https?:\/\//i.test(u)) {
        throw new Error(`快捷封面须为 http(s) URL：${u}`);
      }
    }
    return trimmed;
  }
}
