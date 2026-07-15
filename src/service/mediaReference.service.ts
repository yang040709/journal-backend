import Note from "../model/Note";
import User from "../model/User";
import MediaRef from "../model/MediaRef";
import type { INoteImage } from "../model/Note";
import { logger } from "../utils/logger";
import {
  extractCosKeyFromUrl,
  isCosObjectKey,
  resolveAssetObjectKey,
} from "../utils/cosDelete";
import { CoverService } from "./cover.service";
import {
  deleteIndexByStorageKey,
  deleteIndexByUser,
} from "./userImageAsset.service";
import { enqueueCosDeletes } from "./pendingCosDelete.service";
import { isOwnedCosKey } from "../utils/cosKeyOwnership";

export type UnreferenceReason =
  | "gallery"
  | "edit"
  | "purge"
  | "note_delete";

export interface UnreferenceOptions {
  reason: UnreferenceReason;
  source?: "note" | "cover";
  refId?: string;
  assetId?: string;
  /** UserImageAsset.storageKey（封面为 cover:{id}） */
  galleryStorageKey?: string;
  assetUrl?: string;
  assetThumbKey?: string;
}

export interface UnreferenceResult {
  cosKey: string;
  notesUpdated: number;
  refsRemaining: number;
  cosDeleteQueued: boolean;
  cosKeysQueued: number;
}

function collectCosKeys(cosKey: string, thumbKey?: string | null): string[] {
  const keys = new Set<string>();
  if (isCosObjectKey(cosKey)) keys.add(cosKey);
  const thumb = String(thumbKey || "").trim();
  if (isCosObjectKey(thumb)) keys.add(thumb);
  return [...keys];
}

export class MediaReferenceService {
  static resolveCosKeyFromAsset(asset: {
    source?: "note" | "cover";
    storageKey?: string;
    url?: string;
  }): string | null {
    return resolveAssetObjectKey(asset);
  }

  static async countRefs(userId: string, cosKey: string): Promise<number> {
    return MediaRef.countDocuments({ userId, cosKey });
  }

  /**
   * 与手帐 images 同步引用（编辑保存时调用；兼容旧数据逐步补齐 refs）
   */
  static async syncNoteImages(
    userId: string,
    noteId: string,
    images: INoteImage[] | undefined,
  ): Promise<void> {
    const list = Array.isArray(images) ? images : [];
    const currentKeys = list
      .map((img) => String(img?.key || "").trim())
      .filter((k) => isCosObjectKey(k) && isOwnedCosKey(userId, k));

    const staleRefs = await MediaRef.find({
      userId,
      holderType: "note",
      holderId: noteId,
      cosKey: { $nin: currentKeys },
    }).lean();

    if (staleRefs.length) {
      await MediaRef.deleteMany({
        userId,
        holderType: "note",
        holderId: noteId,
        cosKey: { $nin: currentKeys },
      });
      for (const ref of staleRefs) {
        await MediaReferenceService.maybeEnqueueCosIfUnreferenced(
          userId,
          String(ref.cosKey),
          ref.thumbKey,
          "edit",
        );
      }
    }

    for (const img of list) {
      const cosKey = String(img?.key || "").trim();
      if (!isCosObjectKey(cosKey) || !isOwnedCosKey(userId, cosKey)) continue;
      await MediaRef.updateOne(
        { userId, cosKey, holderType: "note", holderId: noteId },
        {
          $set: {
            url: img.url,
            ...(img.thumbKey ? { thumbKey: img.thumbKey } : {}),
          },
        },
        { upsert: true },
      );
    }
  }

  static async referenceCover(
    userId: string,
    coverId: string,
    payload: { coverUrl: string; thumbUrl?: string; thumbKey?: string },
  ): Promise<void> {
    const id = String(coverId || "").trim();
    const coverUrl = String(payload.coverUrl || "").trim();
    if (!id || !coverUrl) return;

    const cosKey = extractCosKeyFromUrl(coverUrl);
    if (!cosKey) return;

    const thumbKey =
      payload.thumbKey != null ? String(payload.thumbKey).trim() : "";

    await MediaRef.updateOne(
      { userId, cosKey, holderType: "cover", holderId: id },
      {
        $set: {
          url: coverUrl,
          ...(thumbKey ? { thumbKey } : {}),
        },
      },
      { upsert: true },
    );
  }

  /** 彻底删除手帐时释放该 note 下所有图片引用 */
  static async releaseNoteRefs(
    userId: string,
    noteId: string,
  ): Promise<void> {
    const refs = await MediaRef.find({
      userId,
      holderType: "note",
      holderId: noteId,
    }).lean();

    await MediaRef.deleteMany({
      userId,
      holderType: "note",
      holderId: noteId,
    });

    const cosKeyToThumb = new Map<string, string | undefined>();
    for (const ref of refs) {
      const cosKey = String(ref.cosKey || "").trim();
      if (!cosKey || !isCosObjectKey(cosKey)) continue;
      if (!cosKeyToThumb.has(cosKey)) {
        cosKeyToThumb.set(cosKey, ref.thumbKey ? String(ref.thumbKey) : undefined);
      }
    }

    // 无 MediaRef 或脏 cover: key：从 note.images 解析真实 COS key
    const note = await Note.findOne({ _id: noteId, userId })
      .select("images")
      .lean();
    for (const img of (note?.images || []) as INoteImage[]) {
      const raw = String(img?.key || "").trim();
      let cosKey = isCosObjectKey(raw) ? raw : "";
      if (!cosKey) {
        cosKey = extractCosKeyFromUrl(String(img?.url || "")) || "";
      }
      if (!cosKey || !isOwnedCosKey(userId, cosKey)) continue;
      if (!cosKeyToThumb.has(cosKey)) {
        cosKeyToThumb.set(
          cosKey,
          img?.thumbKey ? String(img.thumbKey) : undefined,
        );
      }
    }

    for (const [cosKey, thumbKey] of cosKeyToThumb) {
      await MediaReferenceService.maybeEnqueueCosIfUnreferenced(
        userId,
        cosKey,
        thumbKey,
        "note_delete",
        { excludeNoteId: noteId },
      );
    }
  }

  /**
   * 解除 media 引用：手帐/封面业务解绑、图库索引删除；引用计数为 0 时 COS 入队。
   * 兼容无 MediaRef 的旧数据：以 Note.images 为准做兜底校验。
   */
  static async unreference(
    userId: string,
    cosKey: string,
    options: UnreferenceOptions,
  ): Promise<UnreferenceResult> {
    const key = String(cosKey || "").trim();
    if (!isCosObjectKey(key)) {
      throw new Error("无效的图片 storageKey");
    }

    let notesUpdated = 0;
    const cosKeysToDelete = new Set<string>(collectCosKeys(key, options.assetThumbKey));

    if (options.source === "cover") {
      const coverId = String(options.refId || "").trim();
      let coverUrl = String(options.assetUrl || "");
      let thumbKey = String(options.assetThumbKey || "");

      if (coverId) {
        const user = await User.findOne({ userId, "customCovers._id": coverId })
          .select("customCovers")
          .lean();
        const coverDoc = Array.isArray((user as any)?.customCovers)
          ? (user as any).customCovers.find(
              (c: any) => String(c?._id) === coverId,
            )
          : null;
        if (coverDoc) {
          coverUrl = String(coverDoc.coverUrl || coverUrl);
          thumbKey = String(coverDoc.thumbKey || thumbKey);
        }

        try {
          await CoverService.deleteUserCustomCover(userId, coverId, {
            releaseMedia: false,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/不存在/.test(msg)) throw err;
        }
      }

      for (const k of collectCosKeys(key, thumbKey)) cosKeysToDelete.add(k);

      await MediaRef.deleteMany({
        userId,
        cosKey: key,
        holderType: "cover",
        ...(coverId ? { holderId: coverId } : {}),
      });
    } else {
      const notesWithImage = await Note.find({ userId, "images.key": key })
        .select("images")
        .lean();
      for (const note of notesWithImage) {
        for (const img of (note.images || []) as INoteImage[]) {
          if (String(img.key || "") === key) {
            for (const k of collectCosKeys(img.key, img.thumbKey)) {
              cosKeysToDelete.add(k);
            }
          }
        }
      }

      const pullResult = await Note.updateMany(
        { userId, "images.key": key },
        { $pull: { images: { key } } },
        { timestamps: false },
      );
      notesUpdated = pullResult.modifiedCount ?? 0;

      await MediaRef.deleteMany({ userId, cosKey: key, holderType: "note" });

      const stillInNotes = await Note.countDocuments({
        userId,
        "images.key": key,
      });
      if (stillInNotes > 0) {
        logger.warn("Unreference aborted: legacy note references remain", {
          userId,
          cosKey: key,
          stillInNotes,
        });
        throw new Error("图片仍被手帐引用，无法彻底删除");
      }
    }

    if (options.assetId) {
      await deleteIndexByUser(userId, options.assetId);
    }
    const galleryKey = String(options.galleryStorageKey || key).trim();
    if (galleryKey) {
      await deleteIndexByStorageKey(userId, galleryKey);
    }

    let refsRemaining = await MediaReferenceService.countRefs(userId, key);
    if (refsRemaining === 0) {
      refsRemaining = await MediaReferenceService.backfillRefsFromNotesIfNeeded(
        userId,
        key,
      );
    }

    let cosDeleteQueued = false;
    let cosKeysQueued = 0;

    if (refsRemaining === 0) {
      const keys = [...cosKeysToDelete]
        .filter(isCosObjectKey)
        .filter((k) => isOwnedCosKey(userId, k));
      if (keys.length) {
        cosKeysQueued = await enqueueCosDeletes(keys, {
          userId,
          source: options.reason,
        });
        cosDeleteQueued = cosKeysQueued > 0;
      }
    }

    return {
      cosKey: key,
      notesUpdated,
      refsRemaining,
      cosDeleteQueued,
      cosKeysQueued,
    };
  }

  /** 旧数据：若 Note 中仍有引用但无 MediaRef，按现状补齐 refs 并返回新计数 */
  private static async backfillRefsFromNotesIfNeeded(
    userId: string,
    cosKey: string,
    excludeNoteId?: string,
  ): Promise<number> {
    const existing = await MediaReferenceService.countRefs(userId, cosKey);
    if (existing > 0) return existing;

    const notes = await Note.find({ userId })
      .select("_id images")
      .lean();

    for (const note of notes) {
      const holderId = String(note._id);
      if (excludeNoteId && holderId === excludeNoteId) continue;

      const img = ((note.images || []) as INoteImage[]).find((i) => {
        const key = String(i.key || "").trim();
        if (key === cosKey) return true;
        if (!isCosObjectKey(key)) {
          const fromUrl = extractCosKeyFromUrl(String(i.url || ""));
          return fromUrl === cosKey;
        }
        return false;
      });
      if (!img) continue;

      await MediaRef.updateOne(
        {
          userId,
          cosKey,
          holderType: "note",
          holderId,
        },
        {
          $set: {
            url: img.url,
            ...(img.thumbKey ? { thumbKey: img.thumbKey } : {}),
          },
        },
        { upsert: true },
      );
    }

    return MediaReferenceService.countRefs(userId, cosKey);
  }

  static async releaseCoverRef(
    userId: string,
    coverId: string,
    payload: { coverUrl: string; thumbKey?: string },
  ): Promise<void> {
    const cosKey = extractCosKeyFromUrl(String(payload.coverUrl || ""));
    if (!cosKey) {
      await deleteIndexByStorageKey(userId, `cover:${coverId}`);
      return;
    }

    await MediaRef.deleteMany({
      userId,
      cosKey,
      holderType: "cover",
      holderId: coverId,
    });
    await deleteIndexByStorageKey(userId, `cover:${coverId}`);
    await MediaReferenceService.maybeEnqueueCosIfUnreferenced(
      userId,
      cosKey,
      payload.thumbKey,
      "edit",
    );
  }

  /** 按 cosKey 解除引用（供编辑页等复用） */
  static async unreferenceByStorageKey(
    userId: string,
    storageKey: string,
    options: Omit<UnreferenceOptions, "assetId" | "galleryStorageKey"> & {
      galleryStorageKey?: string;
      assetId?: string;
    },
  ): Promise<UnreferenceResult> {
    return MediaReferenceService.unreference(userId, storageKey, options);
  }

  private static async maybeEnqueueCosIfUnreferenced(
    userId: string,
    cosKey: string,
    thumbKey: string | undefined,
    reason: UnreferenceReason,
    options?: { excludeNoteId?: string },
  ): Promise<void> {
    let refsRemaining = await MediaReferenceService.countRefs(userId, cosKey);
    if (refsRemaining === 0) {
      refsRemaining = await MediaReferenceService.backfillRefsFromNotesIfNeeded(
        userId,
        cosKey,
        options?.excludeNoteId,
      );
    }
    if (refsRemaining > 0) return;

    await deleteIndexByStorageKey(userId, cosKey);

    const keys = collectCosKeys(cosKey, thumbKey).filter((k) =>
      isOwnedCosKey(userId, k),
    );
    if (keys.length) {
      await enqueueCosDeletes(keys, { userId, source: reason });
    }
  }
}
