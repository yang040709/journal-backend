import { READING_STYLE_KEYS } from "./noteReadingTheme";
import { THEME_IDS_BY_STYLE } from "./readingThemeCatalog";
import {
  READING_STYLE_LABELS,
  THEME_DISPLAY_META,
} from "./readingThemeManifest.generated";

export type ReadingThemeManifestItem = {
  id: string;
  name: string;
  backgroundColor: string;
  cardColor: string;
};

export type ReadingThemeManifestStyle = {
  styleKey: string;
  label: string;
  themes: ReadingThemeManifestItem[];
};

export { READING_STYLE_LABELS };

function buildThemeItem(id: string): ReadingThemeManifestItem {
  const meta = THEME_DISPLAY_META[id];
  return {
    id,
    name: meta?.name || id,
    backgroundColor: meta?.backgroundColor || "#f8f9fa",
    cardColor: meta?.cardColor || "#ffffff",
  };
}

export function buildReadingThemeManifest(): ReadingThemeManifestStyle[] {
  return READING_STYLE_KEYS.map((styleKey) => ({
    styleKey,
    label: READING_STYLE_LABELS[styleKey] || styleKey,
    themes: (THEME_IDS_BY_STYLE[styleKey] || []).map((id) => buildThemeItem(id)),
  }));
}

export const MANIFEST_THEME_IDS_BY_STYLE: Record<string, string[]> = Object.fromEntries(
  READING_STYLE_KEYS.map((key) => [key, [...(THEME_IDS_BY_STYLE[key] || [])]]),
);

export function getManifestThemeIdsByStyle(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(MANIFEST_THEME_IDS_BY_STYLE).map(([key, ids]) => [key, [...ids]]),
  );
}
