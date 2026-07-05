import { READING_STYLE_KEYS } from "./noteReadingTheme";
import { THEME_IDS_BY_STYLE } from "./readingThemeCatalog";

/** 与 client noteReadingTheme.js READING_STYLE_OPTIONS 同源 */
export const READING_STYLE_LABELS: Record<string, string> = {
  journal: "经典手帐风",
  minimalNordic: "简约北欧风",
  vintageJournal: "复古日记风",
  watercolorSketch: "手绘水彩风",
  dreamyCinematic: "梦境电影风",
  productMemo: "清简备忘风",
};

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

/** theme.id → 展示元数据（与 client preset 发版同步） */
const THEME_DISPLAY_META: Record<string, Omit<ReadingThemeManifestItem, "id">> = {
  minimalist_white: { name: "极简白", backgroundColor: "#EBEDF0", cardColor: "#FFFFFF" },
  journal_morning_milk: { name: "晨雾暖白", backgroundColor: "#EDE8DF", cardColor: "#FFFDF9" },
  vintage_paper: { name: "复古书页", backgroundColor: "#E0D8CA", cardColor: "#FAF7F2" },
  sage_green: { name: "鼠尾草绿", backgroundColor: "#D0DCC8", cardColor: "#F1F5EE" },
  sunset_clay: { name: "晚霞陶土", backgroundColor: "#E5D0C0", cardColor: "#FBF3EA" },
  mandy_blue: { name: "静雾蓝", backgroundColor: "#C8D4DC", cardColor: "#EDF2F5" },
  "nordic-default": { name: "冰川白", backgroundColor: "#ECEEF0", cardColor: "#FFFFFF" },
  "nordic-mist": { name: "雾灰蓝", backgroundColor: "#E0E8EE", cardColor: "#FAFCFD" },
  "nordic-dawn": { name: "晨雾青", backgroundColor: "#DCE8E5", cardColor: "#FCFEFD" },
  "nordic-linen": { name: "亚麻暖灰", backgroundColor: "#E6E2DA", cardColor: "#FFFEFC" },
  "nordic-stone": { name: "石灰苔", backgroundColor: "#DDE2DE", cardColor: "#FAFBFA" },
  "vintage-default": { name: "法式米杏", backgroundColor: "#E8DCC8", cardColor: "#FEF8EE" },
  "vintage-rose": { name: "玫瑰旧纸", backgroundColor: "#E6D5CE", cardColor: "#FEF6F1" },
  "vintage-olive": { name: "橄榄旧书", backgroundColor: "#DAD6C6", cardColor: "#F8F6EC" },
  "vintage-honeyPaper": { name: "蜂蜜旧页", backgroundColor: "#E6D4B8", cardColor: "#FDF7EA" },
  "vintage-tea": { name: "陈年茶页", backgroundColor: "#DFD2C0", cardColor: "#FAF4EA" },
  "watercolor-mistSage": { name: "雾灰鼠尾草", backgroundColor: "#DCE6DC", cardColor: "#FAFBF8" },
  "watercolor-grassland": { name: "青青草原", backgroundColor: "#C8E4D0", cardColor: "#FAFEFB" },
  "watercolor-ashLavender": { name: "灰雾薰衣草", backgroundColor: "#E4DCE8", cardColor: "#FEFAFF" },
  "watercolor-peachCloud": { name: "桃雾云霞", backgroundColor: "#F0DCD0", cardColor: "#FFFBF8" },
  "watercolor-skyPowder": { name: "晴空粉蓝", backgroundColor: "#D8E8F4", cardColor: "#FDFEFF" },
  mistBlueStory: { name: "雾蓝叙事", backgroundColor: "#D8E6F4", cardColor: "#FAFCFF" },
  dustyRoseCinema: { name: "灰粉幕间", backgroundColor: "#ECD8DC", cardColor: "#FFF8FA" },
  pearlBlueCinema: { name: "珍珠青幕", backgroundColor: "#D4E8E4", cardColor: "#FAFFFE" },
  lilacHazeCinema: { name: "丁香晨霭", backgroundColor: "#DCD4E8", cardColor: "#FEFAFF" },
  "cinematic-creamLilac": { name: "暮光奶油", backgroundColor: "#F0E4D0", cardColor: "#FFFBF5" },
  "memo-ivory": { name: "留白纸感", backgroundColor: "#EEF1F6", cardColor: "#FFFFFF" },
  "memo-ice": { name: "冰川浅蓝", backgroundColor: "#DDE8F0", cardColor: "#F8FBFD" },
  "memo-oatLatte": { name: "燕麦拿铁", backgroundColor: "#E8E0D4", cardColor: "#FFFCF7" },
  "memo-mintCream": { name: "薄荷奶霜", backgroundColor: "#D8E8DF", cardColor: "#F8FFFA" },
  "memo-charcoal": { name: "石墨夜读", backgroundColor: "#D8DCE2", cardColor: "#FFFFFF" },
};

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
