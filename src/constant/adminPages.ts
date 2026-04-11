/** 后台页面权限 key，与前端菜单、路由一致 */
export const ADMIN_PAGE_NOTES = "notes";
export const ADMIN_PAGE_NOTEBOOKS = "notebooks";
export const ADMIN_PAGE_USERS = "users";
export const ADMIN_PAGE_TEMPLATES = "templates";
export const ADMIN_PAGE_REMINDERS = "reminders";
export const ADMIN_PAGE_NOTE_TAGS = "note_tags";
export const ADMIN_PAGE_AI_STYLES = "ai_styles";
export const ADMIN_PAGE_GALLERY = "gallery";
/** 仅超级管理员，不通过 allowedPages 分配 */
export const ADMIN_PAGE_ADMINS = "admins";

export const ASSIGNABLE_ADMIN_PAGES = [
  ADMIN_PAGE_NOTES,
  ADMIN_PAGE_NOTE_TAGS,
  ADMIN_PAGE_AI_STYLES,
  ADMIN_PAGE_NOTEBOOKS,
  ADMIN_PAGE_USERS,
  ADMIN_PAGE_TEMPLATES,
  ADMIN_PAGE_REMINDERS,
  ADMIN_PAGE_GALLERY,
] as const;

export type AssignableAdminPage = (typeof ASSIGNABLE_ADMIN_PAGES)[number];

export function isAssignablePage(key: string): key is AssignableAdminPage {
  return (ASSIGNABLE_ADMIN_PAGES as readonly string[]).includes(key);
}
