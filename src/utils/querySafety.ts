const DEFAULT_PAGE_DEPTH_LIMIT = (() => {
  const raw = String(process.env.QUERY_PAGE_DEPTH_LIMIT ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : 50_000;
})();

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeKeyword(
  value: unknown,
  options: { min?: number; max?: number } = {},
): string {
  const min = Math.max(0, Math.floor(options.min ?? 0));
  const max = Math.max(min, Math.floor(options.max ?? 100));
  const keyword = String(value ?? "").trim();
  if (!keyword) return "";
  if (keyword.length < min) {
    throw new Error(`搜索关键词至少 ${min} 个字符`);
  }
  if (keyword.length > max) {
    throw new Error(`搜索关键词不能超过 ${max} 个字符`);
  }
  return keyword;
}

export function toSafeRegex(keyword: string, flags = "i"): RegExp {
  return new RegExp(escapeRegex(keyword), flags);
}

export function pickSortField<T extends string>(
  allowed: readonly T[],
  requested: unknown,
  fallback: T,
): T {
  const value = String(requested ?? "").trim() as T;
  if (value && allowed.includes(value)) {
    return value;
  }
  return fallback;
}

export function ensurePageDepth(params: {
  page: number;
  limit: number;
  maxDepth?: number;
  label?: string;
}): void {
  const maxDepth = params.maxDepth ?? DEFAULT_PAGE_DEPTH_LIMIT;
  if (params.page * params.limit > maxDepth) {
    throw new Error(`${params.label ?? "分页深度"}超过限制（page*limit <= ${maxDepth}）`);
  }
}
