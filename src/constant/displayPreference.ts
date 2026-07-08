export const ALBUM_COVER_NO_IMAGE_STYLE_VALUES = [
  "dateTeaser",
  "watermark",
  "excerpt",
] as const;

export type AlbumCoverNoImageStyle =
  (typeof ALBUM_COVER_NO_IMAGE_STYLE_VALUES)[number];

export type DisplayPreferenceSettingType = "boolean" | "enum";

export interface DisplayPreferenceOptionMeta {
  value: string;
  label: string;
}

export interface DisplayPreferenceSettingMeta {
  key: string;
  label: string;
  description: string;
  type: DisplayPreferenceSettingType;
  defaultValue: boolean | string;
  options?: DisplayPreferenceOptionMeta[];
}

export const DISPLAY_PREFERENCE_SETTING_METAS: DisplayPreferenceSettingMeta[] =
  [
    {
      key: "showNoteWordCount",
      label: "详情显示字数",
      description: "手帐详情正文下方显示字数统计",
      type: "boolean",
      defaultValue: false,
      options: [
        { value: "true", label: "开启" },
        { value: "false", label: "关闭" },
      ],
    },
    {
      key: "showReadingThemeClockTime",
      label: "主题显示时分",
      description: "部分阅读主题的时间格式显示到时分",
      type: "boolean",
      defaultValue: false,
      options: [
        { value: "true", label: "开启" },
        { value: "false", label: "关闭" },
      ],
    },
    {
      key: "useLegacyNoteItem",
      label: "列表样式",
      description: "列表使用经典样式或新版顶栏布局",
      type: "boolean",
      defaultValue: false,
      options: [
        { value: "true", label: "经典样式" },
        { value: "false", label: "新版顶栏" },
      ],
    },
    {
      key: "albumCoverHighSaturation",
      label: "相册封面更鲜艳",
      description: "相册模式无图封面使用较高饱和渐变",
      type: "boolean",
      defaultValue: false,
      options: [
        { value: "true", label: "开启" },
        { value: "false", label: "关闭" },
      ],
    },
    {
      key: "albumCoverNoImageStyle",
      label: "无图封面样式",
      description: "相册无封面图时的展示方式",
      type: "enum",
      defaultValue: "dateTeaser",
      options: [
        { value: "dateTeaser", label: "日期+摘要" },
        { value: "watermark", label: "艺术日期" },
        { value: "excerpt", label: "摘要" },
      ],
    },
  ];

export const DISPLAY_PREFERENCE_SETTING_KEYS =
  DISPLAY_PREFERENCE_SETTING_METAS.map((item) => item.key);

export function getDisplayPreferenceSettingMeta(key: string) {
  return DISPLAY_PREFERENCE_SETTING_METAS.find((item) => item.key === key);
}

export function formatDisplayPreferenceValue(
  key: string,
  value: unknown,
): string {
  const meta = getDisplayPreferenceSettingMeta(key);
  if (!meta) return String(value ?? "");

  const normalized =
    meta.type === "boolean" ? String(Boolean(value)) : String(value ?? "");

  const option = meta.options?.find((item) => item.value === normalized);
  return option?.label ?? normalized;
}
