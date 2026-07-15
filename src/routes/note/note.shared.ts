export const MAX_PAGE_DEPTH = 10_000;
export const MIN_SEARCH_KEYWORD_LENGTH = 1;

export function hasAllowedPageDepth(page: number, limit: number): boolean {
  return page * limit <= MAX_PAGE_DEPTH;
}

export function filterTagsByKeyword(tags: string[], keyword: string): string[] {
  if (!keyword) return tags;
  const lowerKeyword = keyword.toLocaleLowerCase();
  return tags.filter((tag) => {
    if (!tag) return false;
    return (
      tag.includes(keyword) || tag.toLocaleLowerCase().includes(lowerKeyword)
    );
  });
}

export function isGuardrailError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  return err.message.includes("分页深度超过限制") || err.message.includes("搜索关键词至少");
}

export function parseFavoriteOnlyQuery(
  v: string | boolean | undefined,
): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "") return false;
  return s === "true" || s === "1" || s === "yes";
}
