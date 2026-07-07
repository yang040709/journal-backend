import { READING_STYLE_KEYS } from "./noteReadingTheme";
import {
  JOURNAL_THEME_IDS,
  THEME_IDS_BY_STYLE,
} from "./readingThemeManifest.generated";

export { JOURNAL_THEME_IDS, THEME_IDS_BY_STYLE };

export const READING_STYLE_KEY_SET = new Set<string>(READING_STYLE_KEYS);

export function getDefaultThemeIdsForStyle(styleKey: string): string[] {
  return [...(THEME_IDS_BY_STYLE[styleKey] || [])];
}
