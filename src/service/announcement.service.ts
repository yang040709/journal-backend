import Announcement, { AnnouncementStatus } from "../model/Announcement";
import { ensurePageDepth, normalizeKeyword, pickSortField, toSafeRegex } from "../utils/querySafety";

const STATUS_WEIGHT: Record<AnnouncementStatus, number> = {
  published: 3,
  draft: 2,
  offline: 1,
};

function normalizeInt(v: unknown, fallback: number, min = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}

function sanitizeImageUrls(images: unknown): string[] {
  const list = Array.isArray(images) ? images : [];
  return list
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

function serializeAnnouncement(row: Record<string, unknown>) {
  return {
    id: String(row._id || ""),
    title: String(row.title || ""),
    content: String(row.content || ""),
    images: Array.isArray(row.images) ? row.images.map((x) => String(x || "")) : [],
    priority: normalizeInt(row.priority, 0),
    showViewCount: Boolean(row.showViewCount),
    viewCount: normalizeInt(row.viewCount, 0),
    status: (String(row.status || "draft") as AnnouncementStatus),
    publishedAt:
      row.publishedAt instanceof Date ? row.publishedAt.toISOString() : row.publishedAt || null,
    offlineAt: row.offlineAt instanceof Date ? row.offlineAt.toISOString() : row.offlineAt || null,
    createdBy: String(row.createdBy || ""),
    updatedBy: String(row.updatedBy || ""),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt || null,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt || null,
  };
}

export class AnnouncementService {
  static buildFrontendPath(id: string): string {
    return `/pages/announcement/detail?id=${encodeURIComponent(id)}`;
  }

  static async listPublic(params: { page?: number; limit?: number }) {
    const page = Math.max(1, normalizeInt(params.page, 1, 1));
    const limit = Math.min(50, Math.max(1, normalizeInt(params.limit, 20, 1)));
    ensurePageDepth({ page, limit });
    const skip = (page - 1) * limit;
    const where = { status: "published" as AnnouncementStatus };

    const [rows, total] = await Promise.all([
      Announcement.find(where)
        .sort({ priority: -1, publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Announcement.countDocuments(where),
    ]);

    const items = rows.map((row) => {
      const item = serializeAnnouncement(row as Record<string, unknown>);
      return {
        id: item.id,
        title: item.title,
        coverImage: item.images[0] || "",
        publishedAt: item.publishedAt,
        showViewCount: item.showViewCount,
        viewCount: item.showViewCount ? item.viewCount : null,
      };
    });

    return { items, total, page, limit };
  }

  static async getPublishedDetailAndIncreaseView(id: string) {
    const doc = await Announcement.findOneAndUpdate(
      { _id: id, status: "published" },
      { $inc: { viewCount: 1 } },
      { new: true },
    ).lean();
    if (!doc) return null;
    return serializeAnnouncement(doc as Record<string, unknown>);
  }

  static async adminList(params: {
    page?: number;
    limit?: number;
    status?: AnnouncementStatus;
    keyword?: string;
    sortBy?: "updatedAt" | "createdAt" | "priority" | "publishedAt" | "status";
    order?: "asc" | "desc";
  }) {
    const page = Math.max(1, normalizeInt(params.page, 1, 1));
    const limit = Math.min(100, Math.max(1, normalizeInt(params.limit, 20, 1)));
    ensurePageDepth({ page, limit });
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    const keyword = normalizeKeyword(params.keyword, { max: 100 });
    if (keyword) {
      where.title = toSafeRegex(keyword);
    }

    const sortBy = pickSortField(
      ["updatedAt", "createdAt", "priority", "publishedAt", "status"] as const,
      params.sortBy,
      "updatedAt",
    );
    const sortOrder = params.order === "asc" ? 1 : -1;
    const sortSpec: Record<string, 1 | -1> = {};
    if (sortBy === "status") {
      sortSpec.status = sortOrder;
      sortSpec.priority = -1;
      sortSpec.updatedAt = -1;
    } else {
      sortSpec[sortBy] = sortOrder;
    }
    sortSpec._id = -1;

    const [rows, total] = await Promise.all([
      Announcement.find(where).sort(sortSpec).skip(skip).limit(limit).lean(),
      Announcement.countDocuments(where),
    ]);

    const items = rows.map((row) => {
      const item = serializeAnnouncement(row as Record<string, unknown>);
      return {
        ...item,
        statusWeight: STATUS_WEIGHT[item.status],
        frontendPath: AnnouncementService.buildFrontendPath(item.id),
      };
    });
    return { items, total, page, limit };
  }

  static async adminGetById(id: string) {
    const row = await Announcement.findById(id).lean();
    if (!row) return null;
    const item = serializeAnnouncement(row as Record<string, unknown>);
    return {
      ...item,
      frontendPath: AnnouncementService.buildFrontendPath(item.id),
    };
  }

  static async adminCreate(
    input: {
      title: string;
      content: string;
      images?: string[];
      priority?: number;
      showViewCount?: boolean;
      status?: AnnouncementStatus;
    },
    admin?: { id?: string },
  ) {
    const status = input.status || "draft";
    const now = new Date();
    const doc = await Announcement.create({
      title: String(input.title || "").trim(),
      content: String(input.content || "").trim(),
      images: sanitizeImageUrls(input.images),
      priority: normalizeInt(input.priority, 0),
      showViewCount: input.showViewCount !== false,
      status,
      publishedAt: status === "published" ? now : null,
      offlineAt: status === "offline" ? now : null,
      createdBy: String(admin?.id || ""),
      updatedBy: String(admin?.id || ""),
    });
    return AnnouncementService.adminGetById(String(doc._id));
  }

  static async adminUpdate(
    id: string,
    input: {
      title?: string;
      content?: string;
      images?: string[];
      priority?: number;
      showViewCount?: boolean;
    },
    admin?: { id?: string },
  ) {
    const setData: Record<string, unknown> = { updatedBy: String(admin?.id || "") };
    if (input.title !== undefined) setData.title = String(input.title || "").trim();
    if (input.content !== undefined) setData.content = String(input.content || "").trim();
    if (input.images !== undefined) setData.images = sanitizeImageUrls(input.images);
    if (input.priority !== undefined) setData.priority = normalizeInt(input.priority, 0);
    if (input.showViewCount !== undefined) setData.showViewCount = Boolean(input.showViewCount);

    const row = await Announcement.findByIdAndUpdate(id, { $set: setData }, { new: true }).lean();
    if (!row) return null;
    return AnnouncementService.adminGetById(String((row as Record<string, unknown>)._id || id));
  }

  static async adminPublish(id: string, admin?: { id?: string }) {
    const now = new Date();
    const row = await Announcement.findByIdAndUpdate(
      id,
      {
        $set: {
          status: "published",
          publishedAt: now,
          offlineAt: null,
          updatedBy: String(admin?.id || ""),
        },
      },
      { new: true },
    ).lean();
    if (!row) return null;
    return AnnouncementService.adminGetById(String((row as Record<string, unknown>)._id || id));
  }

  static async adminOffline(id: string, admin?: { id?: string }) {
    const now = new Date();
    const row = await Announcement.findOneAndUpdate(
      { _id: id, status: "published" },
      {
        $set: {
          status: "offline",
          offlineAt: now,
          updatedBy: String(admin?.id || ""),
        },
      },
      { new: true },
    ).lean();
    if (!row) return null;
    return AnnouncementService.adminGetById(String((row as Record<string, unknown>)._id || id));
  }

  static async adminDeleteDraft(id: string) {
    const row = await Announcement.findOneAndDelete({ _id: id, status: "draft" }).lean();
    return Boolean(row);
  }
}
