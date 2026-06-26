import mongoose from "mongoose";
import {
  findAssetByIdForUser,
} from "./userImageAsset.service";
import { MediaReferenceService } from "./mediaReference.service";

export interface DeleteUserImageAssetResult {
  deleted: true;
  source: "note" | "cover";
  cosKey: string;
  notesUpdated: number;
  refsRemaining: number;
  cosDeleteQueued: boolean;
  cosKeysQueued: number;
}

function isStrictObjectId(id: string): boolean {
  if (!mongoose.Types.ObjectId.isValid(id)) return false;
  return String(new mongoose.Types.ObjectId(id)) === id;
}

export class MediaDeleteOrchestrator {
  /**
   * 从「我的图片」入口彻底删除：按 storageKey 解除引用并删除图库索引。
   * API 仍接受 asset _id，内部 resolve 到 cosKey / galleryStorageKey。
   */
  static async deleteUserImageAsset(
    userId: string,
    assetId: string,
  ): Promise<DeleteUserImageAssetResult | null> {
    const trimmedId = String(assetId || "").trim();
    if (!trimmedId || !isStrictObjectId(trimmedId)) return null;

    const asset = await findAssetByIdForUser(userId, trimmedId);
    if (!asset) return null;

    const cosKey = MediaReferenceService.resolveCosKeyFromAsset({
      source: asset.source,
      storageKey: asset.storageKey,
      url: asset.url,
    });

    if (!cosKey) return null;

    const result = await MediaReferenceService.unreference(userId, cosKey, {
      reason: "gallery",
      source: asset.source,
      refId: asset.refId,
      assetId: trimmedId,
      galleryStorageKey: asset.storageKey,
      assetUrl: asset.url,
      assetThumbKey: asset.thumbKey,
    });

    return {
      deleted: true,
      source: asset.source,
      cosKey: result.cosKey,
      notesUpdated: result.notesUpdated,
      refsRemaining: result.refsRemaining,
      cosDeleteQueued: result.cosDeleteQueued,
      cosKeysQueued: result.cosKeysQueued,
    };
  }
}
