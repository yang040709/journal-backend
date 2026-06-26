import Note from "../model/Note";
import User from "../model/User";
import MediaRef from "../model/MediaRef";
import type { INoteImage } from "../model/Note";
import { logger } from "../utils/logger";
import {
  extractCosKeyFromUrl,
  isCosObjectKey,
} from "../utils/cosDelete";
import { CoverService } from "./cover.service";
import {
  deleteIndexByStorageKey,
  deleteIndexByUser,
} from "./userImageAsset.service";
import { enqueueCosDeletes } from "./pendingCosDelete.service";

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
    source: "note" | "cover";
    storageKey?: string;
    url?: string;
  }): string | null {
    if (asset.source === "note") {
      const key = String(asset.storageKey || "").trim();
      return isCosObjectKey(key) ? key : null;
    }
    return extractCosKeyFromUrl(String(asset.url || ""));
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
      .filter((k) => isCosObjectKey(k));

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
      if (!isCosObjectKey(cosKey)) continue;
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

    if (!refs.length) return;

    await MediaRef.deleteMany({
      userId,
      holderType: "note",
      holderId: noteId,
    });

    const seen = new Set<string>();
    for (const ref of refs) {
      const cosKey = String(ref.cosKey || "");
      if (!cosKey || seen.has(cosKey)) continue;
      seen.add(cosKey);
      await MediaReferenceService.maybeEnqueueCosIfUnreferenced(
        userId,
        cosKey,
        ref.thumbKey,
        "note_delete",
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
      const keys = [...cosKeysToDelete].filter(isCosObjectKey);
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
  ): Promise<number> {
    const existing = await MediaReferenceService.countRefs(userId, cosKey);
    if (existing > 0) return existing;

    const notes = await Note.find({ userId, "images.key": cosKey })
      .select("_id images")
      .lean();

    if (!notes.length) return 0;

    for (const note of notes) {
      const img = ((note.images || []) as INoteImage[]).find(
        (i) => String(i.key || "") === cosKey,
      );
      if (!img) continue;
      await MediaRef.updateOne(
        {
          userId,
          cosKey,
          holderType: "note",
          holderId: String(note._id),
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
  ): Promise<void> {
    let refsRemaining = await MediaReferenceService.countRefs(userId, cosKey);
    if (refsRemaining === 0) {
      refsRemaining = await MediaReferenceService.backfillRefsFromNotesIfNeeded(
        userId,
        cosKey,
      );
    }
    if (refsRemaining > 0) return;

    await deleteIndexByStorageKey(userId, cosKey);

    const keys = collectCosKeys(cosKey, thumbKey);
    if (keys.length) {
      await enqueueCosDeletes(keys, { userId, source: reason });
    }
  }
}
