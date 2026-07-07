import { z } from "zod";

export const MAX_PAGE_DEPTH = (() => {
  const raw = String(process.env.ADMIN_MAX_PAGE_DEPTH ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : 50_000;
})();
export const MIN_SEARCH_LENGTH = 2;
export const ADMIN_EXPORT_LIMIT = 2000;

export function optionalKeywordSchema(max = 128) {
  return z.preprocess((v) => {
    if (v == null || v === "") return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
  }, z.string().min(MIN_SEARCH_LENGTH, `搜索关键词至少 ${MIN_SEARCH_LENGTH} 个字符`).max(max).optional());
}

export function daySpanInclusive(startDate: string, endDate: string): number {
  const a = new Date(`${startDate}T12:00:00Z`).getTime();
  const b = new Date(`${endDate}T12:00:00Z`).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}