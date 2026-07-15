export const MAX_EVENTS_PER_REQUEST = 20;

export const CLIENT_EVENT_NAMES = [
  "note_detail_action_click",
  "note_detail_more_click",
  "me_menu_click",
  "note_form_dock_click",
] as const;

export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];

export const NOTE_DETAIL_ACTIONS = [
  "edit",
  "reminder",
  "reading_theme",
  "export_image",
  "share",
  "more_open",
] as const;

export const NOTE_DETAIL_MORE_ACTIONS = [
  "favorite_toggle",
  "pin_toggle",
  "copy",
  "move_notebook",
  "clone",
  "share_toggle",
  "share_page",
  "apply_template",
  "display_preference",
] as const;

export const NOTE_FORM_DOCK_ACTIONS = [
  "template",
  "ai_journal",
  "add_image",
  "tags",
  "notebook",
  "cancel",
  "save",
] as const;

export const ME_MENU_SECTIONS = [
  "content",
  "preference",
  "account",
  "support",
] as const;

export type MeMenuSection = (typeof ME_MENU_SECTIONS)[number];

export const ME_MENU_ITEMS: Record<MeMenuSection, readonly string[]> = {
  content: [
    "template",
    "tag-settings",
    "reminder",
    "image-gallery",
    "cover-manage",
    "note-export",
  ],
  preference: ["display-preference", "theme-manage", "setting"],
  account: ["stats-analysis", "quota-center", "points"],
  support: ["customerService", "share", "about", "more-features"],
};

const ACTION_BY_EVENT: Record<ClientEventName, readonly string[]> = {
  note_detail_action_click: NOTE_DETAIL_ACTIONS,
  note_detail_more_click: NOTE_DETAIL_MORE_ACTIONS,
  me_menu_click: [],
  note_form_dock_click: NOTE_FORM_DOCK_ACTIONS,
};

export interface ClientEventPropsInput {
  action?: unknown;
  noteId?: unknown;
  section?: unknown;
  itemId?: unknown;
  mode?: unknown;
  toggleValue?: unknown;
}

export interface SanitizedClientEventProps {
  action: string;
  noteId?: string;
  section?: MeMenuSection;
  itemId?: string;
  mode?: "add" | "edit";
  toggleValue?: boolean;
}

export type ClientEventSettingsPayload = {
  enabled: boolean;
  events: Record<ClientEventName, boolean>;
};

export const DEFAULT_CLIENT_EVENT_SETTINGS: ClientEventSettingsPayload = {
  enabled: true,
  events: Object.fromEntries(
    CLIENT_EVENT_NAMES.map((name) => [name, true]),
  ) as Record<ClientEventName, boolean>,
};

export function normalizeClientEventSettings(
  raw: unknown,
): ClientEventSettingsPayload {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const eventsRaw =
    r.events && typeof r.events === "object"
      ? (r.events as Record<string, unknown>)
      : {};

  const events = Object.fromEntries(
    CLIENT_EVENT_NAMES.map((name) => {
      const value = eventsRaw[name];
      return [name, value === false ? false : true];
    }),
  ) as Record<ClientEventName, boolean>;

  return {
    enabled: r.enabled === false ? false : true,
    events,
  };
}

export function isClientEventTrackingAllowed(
  settings: ClientEventSettingsPayload,
  eventName: string,
): boolean {
  if (!settings.enabled) return false;
  if (!isClientEventName(eventName)) return false;
  return settings.events[eventName] !== false;
}

export const CLIENT_EVENT_LABELS: Record<ClientEventName, string> = {
  note_detail_action_click: "手帐详情底栏",
  note_detail_more_click: "手帐详情更多",
  me_menu_click: "我的页菜单",
  note_form_dock_click: "写/编辑手帐 Dock",
};

export const ME_MENU_SECTION_LABELS: Record<MeMenuSection, string> = {
  content: "内容与记录",
  preference: "偏好设置",
  account: "账户与数据",
  support: "支持与帮助",
};

export const ME_MENU_ITEM_LABELS: Record<string, string> = {
  template: "我的模板",
  "tag-settings": "我的标签",
  reminder: "我的提醒",
  "image-gallery": "我的图片",
  "cover-manage": "我的手帐本封面",
  "note-export": "导出为表格",
  "display-preference": "显示偏好",
  "theme-manage": "管理主题",
  setting: "应用设置",
  "stats-analysis": "统计分析",
  "quota-center": "额度中心",
  points: "积分账户",
  customerService: "反馈与建议",
  share: "推荐应用",
  about: "关于应用",
  "more-features": "更多功能",
};

export const NOTE_DETAIL_ACTION_LABELS: Record<string, string> = {
  edit: "编辑",
  reminder: "提醒",
  reading_theme: "阅读主题",
  export_image: "导出图片",
  share: "分享",
  more_open: "更多",
};

export const NOTE_DETAIL_MORE_ACTION_LABELS: Record<string, string> = {
  favorite_toggle: "收藏",
  pin_toggle: "置顶",
  copy: "复制内容",
  move_notebook: "移动手帐本",
  clone: "克隆手帐",
  share_toggle: "分享开关",
  share_page: "分享页",
  apply_template: "应用模板",
  display_preference: "显示偏好",
};

export const NOTE_FORM_DOCK_ACTION_LABELS: Record<string, string> = {
  template: "模板",
  ai_journal: "灵感写手帐",
  add_image: "添加图片",
  tags: "标签",
  notebook: "手帐本",
  cancel: "取消",
  save: "保存",
};

function isMeMenuItemValid(section: string, itemId: string): boolean {
  const items = ME_MENU_ITEMS[section as MeMenuSection];
  return Boolean(items?.includes(itemId));
}

export function isClientEventName(value: string): value is ClientEventName {
  return (CLIENT_EVENT_NAMES as readonly string[]).includes(value);
}

export function getClientEventLabel(eventName: string): string {
  if (isClientEventName(eventName)) {
    return CLIENT_EVENT_LABELS[eventName];
  }
  return eventName;
}

export function getClientEventActionLabel(
  eventName: string,
  action: string,
  extras?: { section?: string; itemId?: string; mode?: string },
): string {
  if (eventName === "me_menu_click" && extras?.itemId) {
    return ME_MENU_ITEM_LABELS[extras.itemId] ?? extras.itemId;
  }
  if (eventName === "note_detail_action_click") {
    return NOTE_DETAIL_ACTION_LABELS[action] ?? action;
  }
  if (eventName === "note_detail_more_click") {
    return NOTE_DETAIL_MORE_ACTION_LABELS[action] ?? action;
  }
  if (eventName === "note_form_dock_click") {
    const actionLabel = NOTE_FORM_DOCK_ACTION_LABELS[action] ?? action;
    if (extras?.mode === "add") {
      return `${actionLabel}（新建）`;
    }
    if (extras?.mode === "edit") {
      return `${actionLabel}（编辑）`;
    }
    return actionLabel;
  }
  return action;
}

export function sanitizeClientEventProps(
  eventName: ClientEventName,
  raw: ClientEventPropsInput | null | undefined,
): SanitizedClientEventProps | null {
  if (!raw || typeof raw !== "object") return null;

  const action = typeof raw.action === "string" ? raw.action.trim() : "";
  if (!action) return null;

  if (eventName === "me_menu_click") {
    const section =
      typeof raw.section === "string" ? raw.section.trim() : "";
    const itemId = typeof raw.itemId === "string" ? raw.itemId.trim() : "";
    if (!section || !itemId) return null;
    if (!ME_MENU_SECTIONS.includes(section as MeMenuSection)) return null;
    if (!isMeMenuItemValid(section, itemId)) return null;
    return { action, section: section as MeMenuSection, itemId };
  }

  const allowed = ACTION_BY_EVENT[eventName];
  if (!allowed.includes(action)) return null;

  const sanitized: SanitizedClientEventProps = { action };

  if (typeof raw.noteId === "string" && raw.noteId.trim()) {
    sanitized.noteId = raw.noteId.trim();
  }

  if (eventName === "note_form_dock_click") {
    const mode = typeof raw.mode === "string" ? raw.mode.trim() : "";
    if (mode !== "add" && mode !== "edit") return null;
    sanitized.mode = mode;
  }

  if (typeof raw.toggleValue === "boolean") {
    sanitized.toggleValue = raw.toggleValue;
  }

  if (
    (eventName === "note_detail_action_click" ||
      eventName === "note_detail_more_click") &&
    !sanitized.noteId
  ) {
    return null;
  }

  return sanitized;
}
