// AUTO-GENERATED — do not edit.
// Source: client preset (color-presets.js / style-theme-presets.js / noteReadingTheme.js).
// Regenerate manually after preset changes (NOT auto on dev/build/deploy):
//   cd backend; pnpm generated:reading-theme-manifest
// Drift check runs automatically only before `cd backend; pnpm test` (pretest).

export const READING_STYLE_KEYS = ["journal", "minimalNordic", "vintageJournal", "watercolorSketch", "dreamyCinematic", "productMemo", "filmTravel"] as const;

export type GeneratedReadingStyleKey = (typeof READING_STYLE_KEYS)[number];

/** 与 client noteReadingTheme.js READING_STYLE_OPTIONS 同源 */
export const READING_STYLE_LABELS: Record<string, string> = {
  journal: "经典手帐风",
  minimalNordic: "简约北欧风",
  vintageJournal: "复古日记风",
  watercolorSketch: "手绘水彩风",
  dreamyCinematic: "梦境电影风",
  productMemo: "清简备忘风",
  filmTravel: "胶片旅行风",
};

/** journal 风格主题色 id（与 client color-presets.js 同源） */
export const JOURNAL_THEME_IDS = ["minimalist_white", "journal_morning_milk", "vintage_paper", "sage_green", "sunset_clay", "mandy_blue"] as const;

/** 各阅读风格默认主题色 id 顺序（与 client style-theme-presets.js 同源） */
export const THEME_IDS_BY_STYLE: Record<string, readonly string[]> = {
  journal: JOURNAL_THEME_IDS,
  minimalNordic: ["nordic-default", "nordic-mist", "nordic-dawn", "nordic-linen", "nordic-stone"],
  vintageJournal: ["vintage-default", "vintage-rose", "vintage-olive", "vintage-honeyPaper", "vintage-tea"],
  watercolorSketch: ["watercolor-mistSage", "watercolor-grassland", "watercolor-ashLavender", "watercolor-peachCloud", "watercolor-skyPowder"],
  dreamyCinematic: ["mistBlueStory", "dustyRoseCinema", "pearlBlueCinema", "lilacHazeCinema", "cinematic-creamLilac"],
  productMemo: ["memo-ivory", "memo-ice", "memo-oatLatte", "memo-mintCream", "memo-charcoal"],
  filmTravel: ["film-default", "film-golden", "film-mintTrail", "film-sakuraPass"],
};

/** theme.id → 展示元数据（与 client preset 发版同步） */
export const THEME_DISPLAY_META: Record<string, { name: string; backgroundColor: string; cardColor: string }> = {
  "cinematic-creamLilac": { name: "暮光奶油", backgroundColor: "#F0E4D0", cardColor: "#FFFBF5" },
  dustyRoseCinema: { name: "灰粉幕间", backgroundColor: "#ECD8DC", cardColor: "#FFF8FA" },
  "film-default": { name: "银盐胶片", backgroundColor: "#C8D2DC", cardColor: "#FAFBFC" },
  "film-golden": { name: "日落金调", backgroundColor: "#F2E8D6", cardColor: "#FFFBF2" },
  "film-mintTrail": { name: "薄荷旅途", backgroundColor: "#DDECE4", cardColor: "#F4FFF9" },
  "film-sakuraPass": { name: "暮樱印记", backgroundColor: "#EDE0E6", cardColor: "#FFF8FA" },
  journal_morning_milk: { name: "晨雾暖白", backgroundColor: "#EDE8DF", cardColor: "#FFFDF9" },
  lilacHazeCinema: { name: "丁香晨霭", backgroundColor: "#DCD4E8", cardColor: "#FEFAFF" },
  mandy_blue: { name: "静雾蓝", backgroundColor: "#C8D4DC", cardColor: "#EDF2F5" },
  "memo-charcoal": { name: "石墨夜读", backgroundColor: "#D8DCE2", cardColor: "#FFFFFF" },
  "memo-ice": { name: "冰川浅蓝", backgroundColor: "#DDE8F0", cardColor: "#F8FBFD" },
  "memo-ivory": { name: "留白纸感", backgroundColor: "#EEF1F6", cardColor: "#FFFFFF" },
  "memo-mintCream": { name: "薄荷奶霜", backgroundColor: "#D8E8DF", cardColor: "#F8FFFA" },
  "memo-oatLatte": { name: "燕麦拿铁", backgroundColor: "#E8E0D4", cardColor: "#FFFCF7" },
  minimalist_white: { name: "极简白", backgroundColor: "#F7F8FA", cardColor: "#FFFFFF" },
  mistBlueStory: { name: "雾蓝叙事", backgroundColor: "#D8E6F4", cardColor: "#FAFCFF" },
  "nordic-dawn": { name: "晨雾青", backgroundColor: "#DCE8E5", cardColor: "#FCFEFD" },
  "nordic-default": { name: "冰川白", backgroundColor: "#ECEEF0", cardColor: "#FFFFFF" },
  "nordic-linen": { name: "亚麻暖灰", backgroundColor: "#E6E2DA", cardColor: "#FFFEFC" },
  "nordic-mist": { name: "雾灰蓝", backgroundColor: "#E0E8EE", cardColor: "#FAFCFD" },
  "nordic-stone": { name: "石灰苔", backgroundColor: "#DDE2DE", cardColor: "#FAFBFA" },
  pearlBlueCinema: { name: "珍珠青幕", backgroundColor: "#D4E8E4", cardColor: "#FAFFFE" },
  sage_green: { name: "鼠尾草绿", backgroundColor: "#D0DCC8", cardColor: "#F1F5EE" },
  sunset_clay: { name: "晚霞陶土", backgroundColor: "#E5D0C0", cardColor: "#FBF3EA" },
  "vintage-default": { name: "法式米杏", backgroundColor: "#E8DCC8", cardColor: "#FEF8EE" },
  "vintage-honeyPaper": { name: "蜂蜜旧页", backgroundColor: "#E6D4B8", cardColor: "#FDF7EA" },
  "vintage-olive": { name: "橄榄旧书", backgroundColor: "#DAD6C6", cardColor: "#F8F6EC" },
  "vintage-rose": { name: "玫瑰旧纸", backgroundColor: "#E6D5CE", cardColor: "#FEF6F1" },
  "vintage-tea": { name: "陈年茶页", backgroundColor: "#DFD2C0", cardColor: "#FAF4EA" },
  vintage_paper: { name: "复古书页", backgroundColor: "#E0D8CA", cardColor: "#FAF7F2" },
  "watercolor-ashLavender": { name: "灰雾薰衣草", backgroundColor: "#E4DCE8", cardColor: "#FEFAFF" },
  "watercolor-grassland": { name: "青青草原", backgroundColor: "#C8E4D0", cardColor: "#FAFEFB" },
  "watercolor-mistSage": { name: "雾灰鼠尾草", backgroundColor: "#DCE6DC", cardColor: "#FAFBF8" },
  "watercolor-peachCloud": { name: "桃雾云霞", backgroundColor: "#F0DCD0", cardColor: "#FFFBF8" },
  "watercolor-skyPowder": { name: "晴空粉蓝", backgroundColor: "#D8E8F4", cardColor: "#FDFEFF" },
};
