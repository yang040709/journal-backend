import { READING_STYLE_KEYS } from "./noteReadingTheme";

/** journal 风格主题色 id（与 client color-presets.js 同源） */
export const JOURNAL_THEME_IDS = [
  "minimalist_white",
  "journal_morning_milk",
  "vintage_paper",
  "sage_green",
  "sunset_clay",
  "mandy_blue",
] as const;

/** 各阅读风格默认主题色 id 顺序（与 client style-theme-presets.js 同源） */
export const THEME_IDS_BY_STYLE: Record<string, readonly string[]> = {
  journal: JOURNAL_THEME_IDS,
  minimalNordic: [
    "nordic-default",
    "nordic-mist",
    "nordic-dawn",
    "nordic-linen",
    "nordic-stone",
  ],
  vintageJournal: [
    "vintage-default",
    "vintage-rose",
    "vintage-olive",
    "vintage-honeyPaper",
    "vintage-tea",
  ],
  watercolorSketch: [
    "watercolor-mistSage",
    "watercolor-grassland",
    "watercolor-ashLavender",
    "watercolor-peachCloud",
    "watercolor-skyPowder",
  ],
  dreamyCinematic: [
    "mistBlueStory",
    "dustyRoseCinema",
    "pearlBlueCinema",
    "lilacHazeCinema",
    "cinematic-creamLilac",
  ],
  productMemo: [
    "memo-ivory",
    "memo-ice",
    "memo-oatLatte",
    "memo-mintCream",
    "memo-charcoal",
  ],
};

export const READING_STYLE_KEY_SET = new Set<string>(READING_STYLE_KEYS);

export function getDefaultThemeIdsForStyle(styleKey: string): string[] {
  return [...(THEME_IDS_BY_STYLE[styleKey] || [])];
}
