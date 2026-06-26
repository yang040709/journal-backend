export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";

const EXT_TO_MIME: Record<string, SupportedImageMime> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const SUPPORTED_MIMES = new Set<string>(["image/jpeg", "image/png", "image/webp"]);

export function normalizeImageMimeType(
  mimeType: unknown,
  urlOrFileName = "",
): SupportedImageMime | "" {
  const normalizedMime =
    mimeType === "image/jpg"
      ? "image/jpeg"
      : typeof mimeType === "string"
        ? mimeType.trim()
        : "";
  if (SUPPORTED_MIMES.has(normalizedMime)) {
    return normalizedMime as SupportedImageMime;
  }

  const source = String(urlOrFileName || "").trim();
  if (!source) return "";

  const withoutQuery = source.split("?")[0]?.split("#")[0] || source;
  const lower = withoutQuery.toLowerCase();
  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx < 0) return "";
  const ext = lower.slice(dotIdx);
  return EXT_TO_MIME[ext] || "";
}

export function normalizeNoteImageMime<T extends { url?: string; mimeType?: string }>(
  image: T,
): SupportedImageMime | "" {
  return normalizeImageMimeType(image.mimeType, image.url || "");
}
