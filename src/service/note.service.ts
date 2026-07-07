export {
  CreateNoteData,
  UpdateNoteData,
  PaginationParams,
  SearchParams,
  SharedNoteView,
  ShareAccessError,
  NotePinLimitExceededError,
  toSharedNoteView,
  SearchNotesResult,
  OnThisDayGroup,
  OnThisDayResult,
  TRASH_RETAIN_DAYS,
  NOTE_TAG_MAX_LENGTH,
  NOTE_TAG_MAX_COUNT,
  MAX_PAGE_DEPTH,
  MIN_SEARCH_KEYWORD_LENGTH,
  MAX_PINNED_PER_NOTEBOOK,
  buildNoteListSortClause,
  isLikelyWeChatOpenId,
  sanitizeNoteTags,
  getTrashExpireAt,
  sanitizeIanaTimeZone,
  isValidMonthDay,
} from "./note/note.shared";

export { NoteCrudService } from "./note/noteCrud.service";
export { NoteTrashService } from "./note/noteTrash.service";
export { NoteShareService } from "./note/noteShare.service";
export { NoteSearchService } from "./note/noteSearch.service";
export { NoteInsightsService } from "./note/noteInsights.service";

import { INote, LeanNote } from "../model/Note";
import {
  CreateNoteData,
  UpdateNoteData,
  PaginationParams,
  SearchParams,
  SharedNoteView,
  SearchNotesResult,
  OnThisDayResult,
} from "./note/note.shared";
import { NoteCrudService } from "./note/noteCrud.service";
import { NoteTrashService } from "./note/noteTrash.service";
import { NoteShareService } from "./note/noteShare.service";
import { NoteSearchService } from "./note/noteSearch.service";
import { NoteInsightsService } from "./note/noteInsights.service";

export class NoteService {
  static async createNote(data: CreateNoteData): Promise<INote> {
    return NoteCrudService.createNote(data);
  }

  static async getNotes(
    userId: string,
    params: PaginationParams & { noteBookId?: string } = {},
  ): Promise<{ items: LeanNote[]; total: number }> {
    return NoteCrudService.getNotes(userId, params);
  }

  static async getNoteById(
    id: string,
    userId: string,
  ): Promise<LeanNote | null> {
    return NoteCrudService.getNoteById(id, userId);
  }

  static async updateNote(
    id: string,
    userId: string,
    data: UpdateNoteData,
  ): Promise<INote | null> {
    return NoteCrudService.updateNote(id, userId, data);
  }

  static async deleteNote(id: string, userId: string): Promise<boolean> {
    return NoteCrudService.deleteNote(id, userId);
  }

  static async batchDeleteNotes(
    noteIds: string[],
    userId: string,
  ): Promise<number> {
    return NoteCrudService.batchDeleteNotes(noteIds, userId);
  }

  static async validateNoteAccess(
    noteId: string,
    userId: string,
  ): Promise<boolean> {
    return NoteCrudService.validateNoteAccess(noteId, userId);
  }

  static async getTrashNoteById(
    id: string,
    userId: string,
  ): Promise<LeanNote | null> {
    return NoteTrashService.getTrashNoteById(id, userId);
  }

  static async getTrashNotes(
    userId: string,
    params: PaginationParams = {},
  ): Promise<{ items: LeanNote[]; total: number }> {
    return NoteTrashService.getTrashNotes(userId, params);
  }

  static async restoreNote(
    id: string,
    userId: string,
    targetNoteBookId?: string,
  ): Promise<{ note: INote; restoredToNoteBookId: string; restoredToNoteBookTitle: string } | null> {
    return NoteTrashService.restoreNote(id, userId, targetNoteBookId);
  }

  static async purgeNote(id: string, userId: string): Promise<boolean> {
    return NoteTrashService.purgeNote(id, userId);
  }

  static async searchNotes(
    userId: string,
    params: SearchParams,
  ): Promise<SearchNotesResult> {
    return NoteSearchService.searchNotes(userId, params);
  }

  static async getRecentNotes(
    userId: string,
    limit: number = 10,
  ): Promise<LeanNote[]> {
    return NoteSearchService.getRecentNotes(userId, limit);
  }

  static async getSharedNoteForPublic(
    shareId: string,
    viewerUserId?: string | null,
  ): Promise<SharedNoteView | null> {
    return NoteShareService.getSharedNoteForPublic(shareId, viewerUserId);
  }

  static async setNoteShareStatus(
    noteId: string,
    userId: string,
    share: boolean,
  ): Promise<INote | null> {
    return NoteShareService.setNoteShareStatus(noteId, userId, share);
  }

  static generateShareId(): string {
    return NoteShareService.generateShareId();
  }

  static async getSharedNotes(userId: string): Promise<LeanNote[]> {
    return NoteShareService.getSharedNotes(userId);
  }

  static async getCalendarDailyCounts(
    userId: string,
    startTime: number,
    endTime: number,
    timeZone: string,
  ): Promise<{
    days: { date: string; count: number }[];
    maxCount: number;
    tz: string;
  }> {
    return NoteInsightsService.getCalendarDailyCounts(
      userId,
      startTime,
      endTime,
      timeZone,
    );
  }

  static isValidMonthDay(month: number, day: number): boolean {
    return NoteInsightsService.isValidMonthDay(month, day);
  }

  static async getNotesOnThisDay(
    userId: string,
    month: number,
    day: number,
    timeZone: string,
    limit: number,
  ): Promise<OnThisDayResult> {
    return NoteInsightsService.getNotesOnThisDay(
      userId,
      month,
      day,
      timeZone,
      limit,
    );
  }
}
