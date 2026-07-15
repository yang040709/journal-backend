import { replaceSensitiveWords } from "./sensitive-encrypted";

/** 列表/相册封面展示用的正文摘要最大长度 */
export const NOTE_CONTENT_PREVIEW_MAX_LENGTH = 120;

/**
 * 将手帐正文规范为预览文本：取首段，段内保留换行。
 */
export function normalizeNotePlainText(raw: string): string {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const firstParagraph = text.split(/\n{2,}/)[0] ?? text;
  const lines = firstParagraph
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

/**
 * 生成列表用 contentPreview：先敏感词过滤，再截断。
 */
export function buildNoteContentPreview(
  content: string,
  maxLength: number = NOTE_CONTENT_PREVIEW_MAX_LENGTH,
): string {
  const normalized = normalizeNotePlainText(content);
  if (!normalized) return "";

  const filtered = replaceSensitiveWords(normalized);
  if (filtered.length <= maxLength) return filtered;

  const sliced = filtered.slice(0, maxLength).trimEnd();
  return sliced.length > 0 ? sliced : filtered.slice(0, maxLength);
}
