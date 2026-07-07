import { INoteImage, LeanNote } from "../../model/Note";
import { LeanNoteBook } from "../../model/NoteBook";

export interface CreateNoteData {
  noteBookId: string;
  title: string;
  content: string;
  tags?: string[];
  images?: INoteImage[];
  userId: string;
  appliedSystemTemplateKey?: string;
}

export interface UpdateNoteData {
  title?: string;
  content?: string;
  tags?: string[];
  noteBookId?: string;
  images?: INoteImage[];
  isFavorite?: boolean;
  isPinned?: boolean;
  readingStyleKey?: string | null;
  readingThemeId?: string | null;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: "asc" | "desc";
  noteBookId?: string;
  tags?: string[];
  startTime?: number;
  endTime?: number;
  favoriteOnly?: boolean;
}

export interface SearchParams {
  q: string;
  page?: number;
  limit?: number;
  noteBookId?: string;
  tags?: string[];
  startTime?: number;
  endTime?: number;
  favoriteOnly?: boolean;
  sortBy?: string;
  order?: "asc" | "desc";
}

export interface SharedNoteView {
  id: string;
  title: string;
  content: string;
  tags: string[];
  images: INoteImage[];
  createdAt: unknown;
  updatedAt: unknown;
  isOwner: boolean;
}

export class ShareAccessError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class NotePinLimitExceededError extends Error {
  constructor(message: string = "置顶数量已达上限，请先取消其他置顶") {
    super(message);
    this.name = "NotePinLimitExceededError";
  }
}

export function toSharedNoteView(
  lean: LeanNote,
  viewerUserId?: string | null,
): SharedNoteView {
  return {
    id: lean.id,
    title: lean.title,
    content: lean.content,
    tags: lean.tags ?? [],
    images: lean.images ?? [],
    createdAt: lean.createdAt,
    updatedAt: lean.updatedAt,
    isOwner: Boolean(
      viewerUserId && lean.userId && viewerUserId === lean.userId,
    ),
  };
}

export interface SearchNotesResult {
  items: LeanNote[];
  total: number;
}

export interface OnThisDayGroup {
  year: number;
  yearsAgo: number;
  items: LeanNote[];
}

export interface OnThisDayResult {
  anchor: { month: number; day: number; label: string };
  tz: string;
  groups: OnThisDayGroup[];
  total: number;
  totalMatched: number;
  truncated: boolean;
}

export const TRASH_RETAIN_DAYS = 7;
export const NOTE_TAG_MAX_LENGTH = 20;
export const NOTE_TAG_MAX_COUNT = 100;
export const MAX_PAGE_DEPTH = 10_000;
export const MIN_SEARCH_KEYWORD_LENGTH = 1;
const WECHAT_OPENID_PATTERN = /^o[A-Za-z0-9_-]{15,63}$/;
export const MAX_PINNED_PER_NOTEBOOK = 5;

type NoteListSortField = "createdAt" | "updatedAt" | "title" | "favoritedAt";

export function buildNoteListSortClause(opts: {
  noteBookId?: string;
  favoriteOnly?: boolean;
  sortBy?: string;
  order?: "asc" | "desc";
}): Record<string, 1 | -1> {
  const favoriteOnly = Boolean(opts.favoriteOnly);
  let sortField = (opts.sortBy ?? "").trim();
  let sortOrder: 1 | -1 = opts.order === "asc" ? 1 : -1;

  if (favoriteOnly && !sortField) {
    sortField = "favoritedAt";
    sortOrder = -1;
  }
  if (!sortField) {
    sortField = "updatedAt";
  }

  const allowed: NoteListSortField[] = [
    "createdAt",
    "updatedAt",
    "title",
    "favoritedAt",
  ];
  const sf = (
    allowed.includes(sortField as NoteListSortField)
      ? sortField
      : "updatedAt"
  ) as NoteListSortField;

  const secondary: Record<string, 1 | -1> = { [sf]: sortOrder };

  if (opts.noteBookId) {
    return {
      isPinned: -1,
      pinnedAt: -1,
      ...secondary,
    };
  }
  return secondary;
}

export function isLikelyWeChatOpenId(value: unknown): boolean {
  const id = String(value || "").trim();
  return WECHAT_OPENID_PATTERN.test(id);
}

export function sanitizeNoteTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const s = String(raw ?? "").trim();
    if (!s || seen.has(s)) continue;
    if (s.length > NOTE_TAG_MAX_LENGTH) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= NOTE_TAG_MAX_COUNT) break;
  }
  return out;
}

export function getTrashExpireAt(base: Date = new Date()): Date {
  return new Date(base.getTime() + TRASH_RETAIN_DAYS * 24 * 60 * 60 * 1000);
}

export function sanitizeIanaTimeZone(raw: string): string {
  const t = String(raw || "").trim();
  if (t.length < 3 || t.length > 64) return "Asia/Shanghai";
  if (!/^[A-Za-z_+/.0-9-]+$/.test(t)) return "Asia/Shanghai";
  return t;
}

export function isValidMonthDay(month: number, day: number): boolean {
  const year = month === 2 && day === 29 ? 2020 : 2000;
  const probe = new Date(year, month - 1, day);
  return probe.getMonth() === month - 1 && probe.getDate() === day;
}

export type { LeanNoteBook };
