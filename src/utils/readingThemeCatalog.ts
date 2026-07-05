import { READING_STYLE_KEYS } from "../constant/noteReadingTheme";
import {
  READING_STYLE_KEY_SET,
  getDefaultThemeIdsForStyle,
} from "../constant/readingThemeCatalog";
import { getManifestThemeIdsByStyle } from "../constant/readingThemeManifest";

export interface ReadingThemeCatalog {
  styleKeys: (string | null)[];
  themeIdsByStyle: Record<string, string[]>;
}

export function buildDefaultReadingThemeCatalog(): ReadingThemeCatalog {
  return {
    styleKeys: [null, ...READING_STYLE_KEYS],
    themeIdsByStyle: Object.fromEntries(
      READING_STYLE_KEYS.map((key) => [key, getDefaultThemeIdsForStyle(key)]),
    ),
  };
}

function dedupeStrings(items: unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const value = String(item ?? "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalizeStyleKeys(raw: unknown): (string | null)[] {
  if (!Array.isArray(raw)) return [];
  const result: (string | null)[] = [];
  const seen = new Set<string>();
  let hasStandard = false;

  for (const item of raw) {
    if (item === null || item === undefined || item === "") {
      if (!hasStandard) {
        result.push(null);
        hasStandard = true;
      }
      continue;
    }
    const key = String(item).trim();
    if (!READING_STYLE_KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }

  return result;
}

function getAllowedIdsForStyle(
  styleKey: string,
  allowedIdsByStyle?: Record<string, readonly string[]>,
): string[] {
  if (allowedIdsByStyle?.[styleKey]) {
    return [...allowedIdsByStyle[styleKey]];
  }
  return getDefaultThemeIdsForStyle(styleKey);
}

function normalizeThemeIdsByStyle(
  raw: unknown,
  allowedIdsByStyle?: Record<string, readonly string[]>,
): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, string[]> = {};
  for (const [styleKey, themeIds] of Object.entries(raw as Record<string, unknown>)) {
    if (!READING_STYLE_KEY_SET.has(styleKey) || !Array.isArray(themeIds)) continue;
    const allowed = getAllowedIdsForStyle(styleKey, allowedIdsByStyle);
    const allowedSet = new Set(allowed);
    const normalized = dedupeStrings(themeIds).filter((id) => allowedSet.has(id));
    if (normalized.length > 0) {
      result[styleKey] = normalized;
    }
  }
  return result;
}

/**
 * 策略 A：将 manifest 中**发版后新增**的 theme id 追加到已存系统 catalog 可见列表末尾；
 * 运营已隐藏（快照中已有但 stored 未含）的 id 不会恢复。
 */
export function mergeSystemCatalogWithManifest(
  stored: ReadingThemeCatalog | null | undefined,
  manifestIdsByStyle: Record<string, readonly string[]> = getManifestThemeIdsByStyle(),
  manifestSnapshotByStyle: Record<string, readonly string[]> | null | undefined = null,
): ReadingThemeCatalog {
  const base = stored
    ? {
        styleKeys: [...stored.styleKeys],
        themeIdsByStyle: { ...stored.themeIdsByStyle },
      }
    : buildDefaultReadingThemeCatalog();

  const normalizedStyles = normalizeStyleKeys(base.styleKeys);
  const styleKeys: (string | null)[] = normalizedStyles.includes(null)
    ? normalizedStyles
    : [null, ...normalizedStyles];

  const visibleStyles = styleKeys.filter((key): key is string => key !== null);
  const themeIdsByStyle: Record<string, string[]> = {};
  const snapshot =
    manifestSnapshotByStyle ??
    manifestIdsByStyle;

  for (const styleKey of visibleStyles) {
    const manifestIds = [...(manifestIdsByStyle[styleKey] || [])];
    const manifestSet = new Set(manifestIds);
    const snapshotSet = new Set(snapshot[styleKey] || []);
    const storedIds = normalizeThemeIdsByStyle(
      { [styleKey]: base.themeIdsByStyle[styleKey] || [] },
      manifestIdsByStyle,
    )[styleKey] || [];

    const merged: string[] = [];
    const seen = new Set<string>();

    for (const id of storedIds) {
      if (!manifestSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      merged.push(id);
    }

    for (const id of manifestIds) {
      if (seen.has(id)) continue;
      if (snapshotSet.has(id)) continue;
      seen.add(id);
      merged.push(id);
    }

    themeIdsByStyle[styleKey] = merged.length > 0 ? merged : [...manifestIds];
  }

  return { styleKeys, themeIdsByStyle };
}

export function parseReadingThemeCatalogFromUser(
  raw: unknown,
): ReadingThemeCatalog | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const styleKeys = normalizeStyleKeys(input.styleKeys);
  const themeIdsByStyle = normalizeThemeIdsByStyle(input.themeIdsByStyle);
  if (styleKeys.length === 0) return null;
  return { styleKeys, themeIdsByStyle };
}

export class ReadingThemeCatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadingThemeCatalogValidationError";
  }
}

function validateCatalogStructure(
  styleKeys: (string | null)[],
  themeIdsByStyle: Record<string, string[]>,
): void {
  if (!styleKeys.includes(null)) {
    throw new ReadingThemeCatalogValidationError("标准阅读不可隐藏");
  }

  if (styleKeys[0] !== null) {
    throw new ReadingThemeCatalogValidationError("标准阅读须排在首位");
  }

  const visibleStyles = styleKeys.filter((key): key is string => key !== null);
  if (visibleStyles.length === 0) {
    throw new ReadingThemeCatalogValidationError("至少保留一种阅读风格");
  }

  for (const styleKey of visibleStyles) {
    const themeIds = themeIdsByStyle[styleKey];
    if (!themeIds || themeIds.length < 1) {
      throw new ReadingThemeCatalogValidationError(
        `风格「${styleKey}」至少保留 1 个可见主题色`,
      );
    }
  }

  for (const styleKey of Object.keys(themeIdsByStyle)) {
    if (!visibleStyles.includes(styleKey)) {
      throw new ReadingThemeCatalogValidationError(
        `隐藏的风格「${styleKey}」不应包含主题色配置`,
      );
    }
  }
}

/**
 * 校验 PUT 请求体；通过则返回可落库的 catalog
 */
export function validateReadingThemeCatalogInput(
  raw: unknown,
  allowedIdsByStyle: Record<string, readonly string[]> = getManifestThemeIdsByStyle(),
): ReadingThemeCatalog {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ReadingThemeCatalogValidationError("主题列表格式不正确");
  }

  const input = raw as Record<string, unknown>;
  const styleKeys = normalizeStyleKeys(input.styleKeys);
  const themeIdsByStyle = normalizeThemeIdsByStyle(input.themeIdsByStyle, allowedIdsByStyle);

  validateCatalogStructure(styleKeys, themeIdsByStyle);

  return {
    styleKeys,
    themeIdsByStyle,
  };
}

/** 校验用户 catalog 须为系统 catalog 的子集 */
export function validateCatalogAgainstSystem(
  catalog: ReadingThemeCatalog,
  systemCatalog: ReadingThemeCatalog,
): void {
  const systemStyles = new Set(
    systemCatalog.styleKeys.filter((key): key is string => key !== null),
  );

  for (const styleKey of catalog.styleKeys) {
    if (styleKey !== null && !systemStyles.has(styleKey)) {
      throw new ReadingThemeCatalogValidationError(
        `风格「${styleKey}」已被系统隐藏，不可加入个人列表`,
      );
    }
  }

  for (const styleKey of Object.keys(catalog.themeIdsByStyle)) {
    const systemIds = new Set(systemCatalog.themeIdsByStyle[styleKey] || []);
    for (const themeId of catalog.themeIdsByStyle[styleKey] || []) {
      if (!systemIds.has(themeId)) {
        throw new ReadingThemeCatalogValidationError(
          `主题色「${themeId}」已被系统隐藏，不可加入个人列表`,
        );
      }
    }
  }
}

export function validateUserReadingThemeCatalogAgainstSystem(
  userInput: unknown,
  systemCatalog: ReadingThemeCatalog,
): ReadingThemeCatalog {
  const catalog = validateReadingThemeCatalogInput(userInput);
  validateCatalogAgainstSystem(catalog, systemCatalog);
  return catalog;
}

export function isThemeIdVisibleInSystemCatalog(
  styleKey: string,
  themeId: string | null | undefined,
  systemCatalog: ReadingThemeCatalog,
): boolean {
  if (!styleKey || !themeId) return false;
  const ids = systemCatalog.themeIdsByStyle[styleKey];
  return !!ids && ids.includes(themeId);
}

export function assertThemeIdAllowedInSystemCatalog(
  styleKey: string | null | undefined,
  themeId: string | null | undefined,
  systemCatalog: ReadingThemeCatalog,
): void {
  if (!styleKey) return;
  if (!themeId) {
    throw new ReadingThemeCatalogValidationError("无效的主题色");
  }
  if (!isThemeIdVisibleInSystemCatalog(styleKey, themeId, systemCatalog)) {
    throw new ReadingThemeCatalogValidationError("无效的主题色");
  }
}

/** 有 style 且显式 themeId 时校验系统 catalog 白名单 */
export function assertReadingThemeSelectionAllowed(
  styleKey: string | null | undefined,
  themeId: string | null | undefined,
  systemCatalog: ReadingThemeCatalog,
): void {
  if (!styleKey || themeId === null || themeId === undefined) return;
  assertThemeIdAllowedInSystemCatalog(styleKey, themeId, systemCatalog);
}
