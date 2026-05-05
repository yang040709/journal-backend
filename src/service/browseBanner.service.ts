import SystemConfig, {
  SYSTEM_CONFIG_BROWSE_BANNERS_KEY,
  type BrowseBannerItem,
} from "../model/SystemConfig";
import { Types } from "mongoose";

export const MAX_BROWSE_BANNERS = 30;

export type BrowseBannerPublicItem = {
  id: string;
  imageUrl: string;
  type: "none" | "link" | "preview_image";
  linkPath?: string;
  previewImageUrl?: string;
  title?: string;
};

export type BrowseBannerAdminItem = Omit<BrowseBannerItem, "clickUvUsers"> & {
  id: string;
  clickUv: number;
};

function maxBanners(): number {
  const n = Number(process.env.MAX_BROWSE_BANNERS);
  if (Number.isFinite(n) && n >= 1) {
    return Math.min(100, Math.floor(n));
  }
  return MAX_BROWSE_BANNERS;
}

/** 仅允许小程序内路径，防外链与伪协议 */
export function assertSafeLinkPath(raw: string): string {
  const path = String(raw || "").trim();
  if (!path.startsWith("/")) {
    throw new Error("跳转路径须以 / 开头");
  }
  if (!path.startsWith("/pages/") && !path.startsWith("/packages/")) {
    throw new Error("跳转路径仅允许 /pages/ 或 /packages/ 开头");
  }
  if (/\s/.test(path) || path.includes("://") || path.includes("..")) {
    throw new Error("跳转路径包含非法字符");
  }
  if (path.length > 512) {
    throw new Error("跳转路径过长");
  }
  const lower = path.toLowerCase();
  if (lower.startsWith("javascript:") || lower.includes("\0")) {
    throw new Error("跳转路径非法");
  }
  return path;
}

function assertImageUrl(raw: string): string {
  const u = String(raw || "").trim();
  if (!/^https?:\/\//i.test(u)) {
    throw new Error("图片须为 http(s) URL");
  }
  if (u.length > 2000) {
    throw new Error("图片 URL 过长");
  }
  return u;
}

function assertPreviewImageUrl(raw: string, imageUrl: string): string {
  const u = assertImageUrl(raw);
  if (u === imageUrl) {
    throw new Error("预览图片链接需与展示图片不同");
  }
  return u;
}

function normalizeNonNegativeInt(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizeUserId(raw: unknown): string {
  return String(raw || "").trim().slice(0, 128);
}

function normalizeInputItem(
  input: Record<string, unknown>,
  index: number,
): BrowseBannerItem {
  const imageUrl = assertImageUrl(String(input.imageUrl ?? ""));
  const type =
    input.type === "link"
      ? "link"
      : input.type === "preview_image"
        ? "preview_image"
        : "none";
  const priority = Number(input.priority);
  if (!Number.isFinite(priority)) {
    throw new Error(`第 ${index + 1} 条：优先级须为数字`);
  }
  const p = Math.floor(priority);
  if (p < -1_000_000 || p > 1_000_000) {
    throw new Error(`第 ${index + 1} 条：优先级超出范围`);
  }
  const enabled = Boolean(input.enabled);
  const titleRaw =
    input.title != null
      ? String(input.title).trim()
      : input.miniappTitle != null
        ? String(input.miniappTitle).trim()
        : "";
  const title = titleRaw.slice(0, 120) || undefined;
  let linkPath: string | undefined;
  let previewImageUrl: string | undefined;
  if (type === "link") {
    linkPath = assertSafeLinkPath(String(input.linkPath ?? ""));
    if (input.previewImageUrl != null && String(input.previewImageUrl).trim()) {
      throw new Error(`第 ${index + 1} 条：跳转类型不应填写预览图片链接`);
    }
  } else if (type === "preview_image") {
    previewImageUrl = assertPreviewImageUrl(String(input.previewImageUrl ?? ""), imageUrl);
    if (input.linkPath != null && String(input.linkPath).trim()) {
      throw new Error(`第 ${index + 1} 条：预览图片类型不应填写跳转路径`);
    }
  } else if (input.linkPath != null && String(input.linkPath).trim()) {
    throw new Error(`第 ${index + 1} 条：类型为「仅展示」时不应填写跳转路径`);
  } else if (input.previewImageUrl != null && String(input.previewImageUrl).trim()) {
    throw new Error(`第 ${index + 1} 条：类型为「仅展示」时不应填写预览图片链接`);
  }
  const id = String(input.id ?? "").trim();
  const normalized: BrowseBannerItem = {
    imageUrl,
    type,
    ...(linkPath ? { linkPath } : {}),
    ...(previewImageUrl ? { previewImageUrl } : {}),
    priority: p,
    enabled,
    ...(title ? { title } : {}),
  };
  if (id) {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error(`第 ${index + 1} 条：id 非法`);
    }
    return {
      ...normalized,
      _id: new Types.ObjectId(id),
    } as BrowseBannerItem;
  }
  return normalized;
}

export class BrowseBannerService {
  static async getDocLean() {
    return SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_BROWSE_BANNERS_KEY,
    }).lean();
  }

  /** C 端：仅启用项，priority 降序 */
  static async listPublic(): Promise<BrowseBannerPublicItem[]> {
    const doc = await BrowseBannerService.getDocLean();
    const list = (doc?.browseBanners || []) as BrowseBannerItem[];
    const enabled = list.filter((b) => b.enabled && String(b.imageUrl || "").trim());
    enabled.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return enabled.map((b) => {
      const id = String((b as { _id?: unknown })?._id || "").trim();
      const titleRaw =
        b?.title != null
          ? String(b.title).trim()
          : (b as { miniappTitle?: unknown })?.miniappTitle != null
            ? String((b as { miniappTitle?: unknown }).miniappTitle).trim()
            : "";
      const base: BrowseBannerPublicItem = {
        id,
        imageUrl: String(b.imageUrl).trim(),
        type:
          b.type === "link" ? "link" : b.type === "preview_image" ? "preview_image" : "none",
        ...(titleRaw ? { title: titleRaw.slice(0, 120) } : {}),
      };
      if (base.type === "link" && b.linkPath) {
        try {
          base.linkPath = assertSafeLinkPath(b.linkPath);
        } catch {
          // 配置异常时不带 linkPath，避免 C 端误点
          base.type = "none";
        }
      }
      if (base.type === "preview_image" && b.previewImageUrl) {
        try {
          base.previewImageUrl = assertPreviewImageUrl(b.previewImageUrl, base.imageUrl);
        } catch {
          base.type = "none";
        }
      }
      return base;
    });
  }

  static async getForAdmin(): Promise<{
    items: BrowseBannerAdminItem[];
    updatedAt: string | null;
  }> {
    const doc = await SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_BROWSE_BANNERS_KEY,
    });
    const raw = (doc?.browseBanners || []) as unknown[];
    const items: BrowseBannerAdminItem[] = raw.map((sub: any) => {
      const id = String(sub?._id || "");
      const imageUrl = String(sub?.imageUrl || "").trim();
      const type =
        sub?.type === "link"
          ? "link"
          : sub?.type === "preview_image"
            ? "preview_image"
            : "none";
      const priority = Number.isFinite(Number(sub?.priority))
        ? Math.floor(Number(sub.priority))
        : 0;
      const enabled = Boolean(sub?.enabled);
      const titleRaw =
        sub?.title != null
          ? String(sub.title).trim()
          : sub?.miniappTitle != null
            ? String(sub.miniappTitle).trim()
            : "";
      const title = titleRaw ? titleRaw.slice(0, 120) : undefined;
      const linkPath =
        type === "link" && sub?.linkPath
          ? String(sub.linkPath).trim()
          : undefined;
      const previewImageUrl =
        type === "preview_image" && sub?.previewImageUrl
          ? String(sub.previewImageUrl).trim()
          : undefined;
      const clickPv = normalizeNonNegativeInt(sub?.clickPv);
      const clickUvUsers = Array.isArray(sub?.clickUvUsers)
        ? sub.clickUvUsers
            .map((x: unknown) => normalizeUserId(x))
            .filter(Boolean)
        : [];
      return {
        id,
        imageUrl,
        type,
        ...(linkPath ? { linkPath } : {}),
        ...(previewImageUrl ? { previewImageUrl } : {}),
        priority,
        enabled,
        clickPv,
        clickUv: clickUvUsers.length,
        ...(title ? { title } : {}),
      };
    });
    return {
      items,
      updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
  }

  /** 全量替换列表 */
  static async setForAdmin(
    inputs: Array<{
      id?: string;
      imageUrl: string;
      type: "none" | "link" | "preview_image";
      linkPath?: string;
      previewImageUrl?: string;
      priority: number;
      enabled: boolean;
      title?: string;
    }>,
  ): Promise<{ items: BrowseBannerAdminItem[]; updatedAt: string }> {
    const max = maxBanners();
    if (inputs.length > max) {
      throw new Error(`轮播最多 ${max} 条`);
    }
    const currentDoc = await SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_BROWSE_BANNERS_KEY,
    })
      .select({ browseBanners: 1 })
      .lean();
    const currentList = (currentDoc?.browseBanners || []) as BrowseBannerItem[];
    const statsById = new Map<
      string,
      {
        clickPv: number;
        clickUvUsers: string[];
      }
    >();
    for (const item of currentList) {
      const id = String((item as { _id?: unknown })?._id || "").trim();
      if (!id) continue;
      statsById.set(id, {
        clickPv: normalizeNonNegativeInt((item as { clickPv?: unknown }).clickPv),
        clickUvUsers: Array.isArray((item as { clickUvUsers?: unknown[] }).clickUvUsers)
          ? (item as { clickUvUsers?: unknown[] }).clickUvUsers!
              .map((x) => normalizeUserId(x))
              .filter(Boolean)
          : [],
      });
    }
    const browseBanners: BrowseBannerItem[] = inputs.map((row, i) => {
      const normalized = normalizeInputItem(row as unknown as Record<string, unknown>, i);
      const rawId = String(row.id || "").trim();
      if (!rawId) return normalized;
      const existingStats = statsById.get(rawId);
      if (!existingStats) return normalized;
      return {
        ...normalized,
        clickPv: existingStats.clickPv,
        clickUvUsers: existingStats.clickUvUsers,
      };
    });
    const doc = await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_BROWSE_BANNERS_KEY },
      { $set: { browseBanners } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    if (!doc) {
      throw new Error("保存浏览轮播失败");
    }
    const next = await BrowseBannerService.getForAdmin();
    return {
      items: next.items,
      updatedAt: next.updatedAt ?? new Date().toISOString(),
    };
  }

  static async recordClick(params: { bannerId: string; userId?: string | null }): Promise<void> {
    const bannerId = String(params.bannerId || "").trim();
    if (!Types.ObjectId.isValid(bannerId)) {
      throw new Error("轮播 ID 非法");
    }
    const userId = normalizeUserId(params.userId);
    const exists = await SystemConfig.exists({
      configKey: SYSTEM_CONFIG_BROWSE_BANNERS_KEY,
      "browseBanners._id": new Types.ObjectId(bannerId),
    });
    if (!exists) {
      throw new Error("轮播不存在");
    }
    await SystemConfig.updateOne(
      {
        configKey: SYSTEM_CONFIG_BROWSE_BANNERS_KEY,
        "browseBanners._id": new Types.ObjectId(bannerId),
      },
      {
        $inc: { "browseBanners.$.clickPv": 1 },
      },
    );
    if (!userId) return;
    await SystemConfig.updateOne(
      {
        configKey: SYSTEM_CONFIG_BROWSE_BANNERS_KEY,
        "browseBanners._id": new Types.ObjectId(bannerId),
      },
      {
        $addToSet: { "browseBanners.$.clickUvUsers": userId },
      },
    );
  }
}
