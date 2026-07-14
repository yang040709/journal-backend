import { extractCosKeyFromUrl, isCosObjectKey } from "./cosDelete";

/**
 * COS object key ownership helpers.
 * Upload STS always writes under `${COS_UPLOAD_DIR}/{userId}/...`.
 */

export class CosKeyOwnershipError extends Error {
  constructor(message = "图片无效或不属于当前账号") {
    super(message);
    this.name = "CosKeyOwnershipError";
  }
}

export function getOwnedCosKeyPrefix(userId: string): string {
  const uploadDir = (process.env.COS_UPLOAD_DIR || "journal").replace(/\/+$/, "");
  const uid = String(userId || "").trim();
  return `${uploadDir}/${uid}/`;
}

export function isOwnedCosKey(userId: string, key: string): boolean {
  const k = String(key || "").trim();
  if (!k || k.includes("..") || k.startsWith("/")) return false;
  return k.startsWith(getOwnedCosKeyPrefix(userId));
}

export function assertOwnedCosKey(userId: string, key: string): void {
  if (!isOwnedCosKey(userId, key)) {
    throw new CosKeyOwnershipError();
  }
}

export type AssertOwnedNoteImageKeysOptions = {
  /** 本笔记已有 key/thumbKey：更新时可祖父放行，避免历史脏数据一保存就失败 */
  allowKeys?: Iterable<string>;
};

function toAllowSet(allowKeys?: Iterable<string>): Set<string> {
  const set = new Set<string>();
  if (!allowKeys) return set;
  for (const raw of allowKeys) {
    const k = String(raw || "").trim();
    if (k) set.add(k);
  }
  return set;
}

/** Collect non-empty key + thumbKey from note image rows. */
export function collectNoteImageKeys(
  images: Array<{ key?: string; thumbKey?: string }> | undefined,
): string[] {
  if (!Array.isArray(images)) return [];
  const out: string[] = [];
  for (const img of images) {
    const key = String(img?.key || "").trim();
    if (key) out.push(key);
    const thumbKey = String(img?.thumbKey || "").trim();
    if (thumbKey) out.push(thumbKey);
  }
  return out;
}

type NoteImageKeyFields = {
  key?: string;
  thumbKey?: string;
  url?: string;
  thumbUrl?: string;
};

/**
 * 将手帐 images 中的 cover: 伪 key / 非法 key 尽量从 url 还原为 COS object key。
 * 无法还原则保留原值（交由后续归属校验拒绝）。
 */
export function normalizeNoteImageObjectKeys<T extends NoteImageKeyFields>(
  images: T[] | undefined,
): T[] | undefined {
  if (!Array.isArray(images)) return images;
  return images.map((img) => {
    const rawKey = String(img?.key || "").trim();
    let key = rawKey;
    if (!isCosObjectKey(rawKey)) {
      const fromUrl = extractCosKeyFromUrl(String(img?.url || ""));
      if (fromUrl) key = fromUrl;
    }

    const rawThumb = String(img?.thumbKey || "").trim();
    let thumbKey = rawThumb;
    if (rawThumb && !isCosObjectKey(rawThumb)) {
      const fromThumbUrl = extractCosKeyFromUrl(String(img?.thumbUrl || ""));
      thumbKey = fromThumbUrl || "";
    }

    if (key === rawKey && thumbKey === rawThumb) return img;

    const next: T = { ...img, key };
    if (thumbKey) {
      (next as NoteImageKeyFields).thumbKey = thumbKey;
    } else if (rawThumb) {
      delete (next as NoteImageKeyFields).thumbKey;
    }
    return next;
  });
}

/** Validate note image keys/thumbKeys belonging to userId. Empty key skipped. */
export function assertOwnedNoteImageKeys(
  userId: string,
  images: Array<{ key?: string; thumbKey?: string }> | undefined,
  options: AssertOwnedNoteImageKeysOptions = {},
): void {
  if (!Array.isArray(images)) return;
  const allow = toAllowSet(options.allowKeys);
  for (const img of images) {
    const key = String(img?.key || "").trim();
    if (key && !allow.has(key)) assertOwnedCosKey(userId, key);
    const thumbKey = String(img?.thumbKey || "").trim();
    if (thumbKey && !allow.has(thumbKey)) assertOwnedCosKey(userId, thumbKey);
  }
}
