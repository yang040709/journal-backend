/** 详情页可保存的阅读风格 key（与导出 filmTravel 等解耦） */
export const READING_STYLE_KEYS = [
  "journal",
  "minimalNordic",
  "vintageJournal",
  "watercolorSketch",
  "dreamyCinematic",
  "productMemo",
] as const;

export type ReadingStyleKey = (typeof READING_STYLE_KEYS)[number];
