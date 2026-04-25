import UserReview, { IUserReview, UserReviewStatus } from "../model/UserReview";
import { ensurePageDepth } from "../utils/querySafety";

function toInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function serializeRow(row: Partial<IUserReview> & { _id?: unknown }) {
  return {
    id: String(row._id || ""),
    content: String(row.content || ""),
    username: String(row.username || ""),
    tag: String(row.tag || ""),
    status: (row.status || "on") as UserReviewStatus,
    sortOrder: toInt(row.sortOrder, 0, -999999, 999999),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt || null,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt || null,
  };
}

export class UserReviewService {
  static async listPublic(input: { page?: number; pageSize?: number }) {
    const page = toInt(input.page, 1, 1, 1000000);
    const pageSize = toInt(input.pageSize, 10, 1, 50);
    ensurePageDepth({ page, limit: pageSize, label: "分页深度" });
    const skip = (page - 1) * pageSize;
    const where = { status: "on" as UserReviewStatus };
    const [rows, total] = await Promise.all([
      UserReview.find(where).sort({ sortOrder: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
      UserReview.countDocuments(where),
    ]);
    return {
      items: rows.map((row) => serializeRow(row as Partial<IUserReview> & { _id?: unknown })),
      total,
      page,
      pageSize,
      hasMore: skip + rows.length < total,
    };
  }

  static async adminList(input: { page?: number; limit?: number; status?: UserReviewStatus }) {
    const page = toInt(input.page, 1, 1, 1000000);
    const limit = toInt(input.limit, 20, 1, 100);
    ensurePageDepth({ page, limit, label: "分页深度" });
    const where: { status?: UserReviewStatus } = {};
    if (input.status) {
      where.status = input.status;
    }
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      UserReview.find(where).sort({ sortOrder: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      UserReview.countDocuments(where),
    ]);
    return {
      items: rows.map((row) => serializeRow(row as Partial<IUserReview> & { _id?: unknown })),
      total,
      page,
      limit,
    };
  }

  static async adminCreate(input: {
    content: string;
    username: string;
    tag?: string;
    status?: UserReviewStatus;
    sortOrder?: number;
  }) {
    const doc = await UserReview.create({
      content: String(input.content || "").trim(),
      username: String(input.username || "").trim(),
      tag: String(input.tag || "").trim(),
      status: input.status || "on",
      sortOrder: toInt(input.sortOrder, 0, -999999, 999999),
    });
    return serializeRow(doc.toObject() as Partial<IUserReview> & { _id?: unknown });
  }

  static async adminUpdate(
    id: string,
    input: Partial<{
      content: string;
      username: string;
      tag: string;
      status: UserReviewStatus;
      sortOrder: number;
    }>,
  ) {
    const set: Record<string, unknown> = {};
    if (input.content !== undefined) set.content = String(input.content || "").trim();
    if (input.username !== undefined) set.username = String(input.username || "").trim();
    if (input.tag !== undefined) set.tag = String(input.tag || "").trim();
    if (input.status !== undefined) set.status = input.status;
    if (input.sortOrder !== undefined) {
      set.sortOrder = toInt(input.sortOrder, 0, -999999, 999999);
    }
    const row = await UserReview.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!row) return null;
    return serializeRow(row as Partial<IUserReview> & { _id?: unknown });
  }

  static async adminDelete(id: string) {
    const row = await UserReview.findByIdAndDelete(id).lean();
    return Boolean(row);
  }
}
