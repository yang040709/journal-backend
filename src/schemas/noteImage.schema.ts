import { z } from "zod";
import { normalizeNoteImageMime } from "../utils/imageMime";

function toNonNegativeInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function preprocessNoteImages(images: unknown): unknown {
  if (!Array.isArray(images)) return images;
  return images.map((item) => {
    if (!item || typeof item !== "object") return item;
    const record = { ...(item as Record<string, unknown>) };
    for (const key of ["thumbUrl", "thumbKey"] as const) {
      if (typeof record[key] === "string" && !String(record[key]).trim()) {
        delete record[key];
      }
    }
    record.width = toNonNegativeInt(record.width);
    record.height = toNonNegativeInt(record.height);
    record.size = toNonNegativeInt(record.size);
    const url = String(record.url || "").trim();
    const mimeType = normalizeNoteImageMime({
      url,
      mimeType: typeof record.mimeType === "string" ? record.mimeType : "",
    });
    if (mimeType) record.mimeType = mimeType;
    return record;
  });
}

export const noteImageSchema = z.object({
  url: z.string().url("图片URL格式不正确"),
  key: z.string().min(1, "图片Key不能为空"),
  thumbUrl: z.string().url("缩略图URL格式不正确").optional(),
  thumbKey: z.string().min(1, "缩略图Key不能为空").optional(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  createdAt: z.coerce.date().optional(),
});

export const noteImagesSchema = z.preprocess(
  preprocessNoteImages,
  z.array(noteImageSchema).max(9, "最多上传9张图片"),
);

export const optionalNoteImagesSchema = z.preprocess(
  preprocessNoteImages,
  z.array(noteImageSchema).max(9, "最多上传9张图片").optional(),
);
