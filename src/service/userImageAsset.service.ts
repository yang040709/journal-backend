import UserImageAsset from "../model/UserImageAsset";
import type { INoteImage } from "../model/Note";
import { logger } from "../utils/logger";

function logWarn(message: string, meta: Record<string, unknown>) {
  logger.warn(message, meta);
}

/**
 * 手帐保存成功后记录图片资产（按 COS key 去重）
 */
export function recordFromNoteImages(
  userId: string,
  noteId: string,
  images: INoteImage[] | undefined,
): void {
  if (!images?.length) return;
  for (const img of images) {
    const key = String(img.key || "").trim();
    if (!key) continue;
    void UserImageAsset.updateOne(
      { userId, storageKey: key },
      {
        $set: {
          userId,
          storageKey: key,
          url: img.url,
          thumbUrl: img.thumbUrl,
          thumbKey: img.thumbKey,
          source: "note" as const,
          refId: String(noteId),
          width: img.width ?? 0,
          height: img.height ?? 0,
          size: img.size ?? 0,
          mimeType: img.mimeType,
        },
      },
      { upsert: true },
    ).catch((err) => {
      logWarn("UserImageAsset note upsert failed", {
        userId,
        noteId,
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

export interface RecordCoverPayload {
  coverUrl: string;
  thumbUrl?: string;
  thumbKey?: string;
}

/**
 * 自定义封面新增/更新后记录（每封面槽位一条，storageKey = cover:{id}）
 */
export function recordFromCover(
  userId: string,
  coverId: string,
  payload: RecordCoverPayload,
): void {
  const id = String(coverId || "").trim();
  const coverUrl = String(payload.coverUrl || "").trim();
  if (!id || !coverUrl) return;

  const storageKey = `cover:${id}`;
  const thumbUrl = payload.thumbUrl != null ? String(payload.thumbUrl).trim() : "";
  const thumbKey = payload.thumbKey != null ? String(payload.thumbKey).trim() : "";

  const $set: Record<string, unknown> = {
    userId,
    storageKey,
    url: coverUrl,
    source: "cover",
    refId: id,
    width: 0,
    height: 0,
    size: 0,
  };
  if (thumbUrl) $set.thumbUrl = thumbUrl;
  if (thumbKey) $set.thumbKey = thumbKey;

  void UserImageAsset.updateOne(
    { userId, storageKey },
    { $set },
    { upsert: true },
  ).catch((err) => {
    logWarn("UserImageAsset cover upsert failed", {
      userId,
      coverId: id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export interface ListUserImageAssetsParams {
  page?: number;
  limit?: number;
  source?: "note" | "cover";
}

export interface UserImageAssetListItem {
  id: string;
  userId: string;
  url: string;
  thumbUrl?: string;
  storageKey: string;
  source: "note" | "cover";
  refId: string;
  width: number;
  height: number;
  size: number;
  mimeType?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListAllUserImageAssetsParams extends ListUserImageAssetsParams {
  userId?: string;
}

export async function listByUser(
  userId: string,
  params: ListUserImageAssetsParams = {},
): Promise<{ items: UserImageAssetListItem[]; total: number }> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { userId };
  if (params.source === "note" || params.source === "cover") {
    query.source = params.source;
  }

  const [docs, total] = await Promise.all([
    UserImageAsset.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UserImageAsset.countDocuments(query),
  ]);

  const items: UserImageAssetListItem[] = docs.map((d: any) => ({
    id: String(d._id),
    userId: String(d.userId || ""),
    url: d.url,
    ...(d.thumbUrl ? { thumbUrl: d.thumbUrl } : {}),
    storageKey: d.storageKey,
    source: d.source,
    refId: d.refId,
    width: d.width ?? 0,
    height: d.height ?? 0,
    size: d.size ?? 0,
    ...(d.mimeType ? { mimeType: d.mimeType } : {}),
    createdAt:
      d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    updatedAt:
      d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
  }));

  return { items, total };
}

export async function listAll(
  params: ListAllUserImageAssetsParams = {},
): Promise<{ items: UserImageAssetListItem[]; total: number }> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (params.source === "note" || params.source === "cover") {
    query.source = params.source;
  }
  if (params.userId) {
    query.userId = params.userId;
  }

  const [docs, total] = await Promise.all([
    UserImageAsset.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UserImageAsset.countDocuments(query),
  ]);

  const items: UserImageAssetListItem[] = docs.map((d: any) => ({
    id: String(d._id),
    userId: String(d.userId || ""),
    url: d.url,
    ...(d.thumbUrl ? { thumbUrl: d.thumbUrl } : {}),
    storageKey: d.storageKey,
    source: d.source,
    refId: d.refId,
    width: d.width ?? 0,
    height: d.height ?? 0,
    size: d.size ?? 0,
    ...(d.mimeType ? { mimeType: d.mimeType } : {}),
    createdAt:
      d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    updatedAt:
      d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
  }));

  return { items, total };
}
