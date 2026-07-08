import Note, { LeanNote } from "../model/Note";
import { toLeanNote, toLeanNoteArray } from "../utils/typeUtils";
import {
  ensurePageDepth,
  normalizeKeyword,
  toSafeRegex,
} from "../utils/querySafety";
import { NoteTrashService } from "./note/noteTrash.service";

export interface AdminTrashNoteListParams {
  page?: number;
  limit?: number;
  userId?: string;
  noteBookId?: string;
  keyword?: string;
  deletedStartTime?: number;
  deletedEndTime?: number;
  includeExpired?: boolean;
}

export class AdminNoteTrashService {
  static async listTrashNotes(
    params: AdminTrashNoteListParams = {},
  ): Promise<{ items: LeanNote[]; total: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    ensurePageDepth({ page, limit });
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      isDeleted: true,
    };
    if (!params.includeExpired) {
      query.deleteExpireAt = { $gt: new Date() };
    }
    if (params.userId?.trim()) {
      query.userId = params.userId.trim();
    }
    if (params.noteBookId?.trim()) {
      query.noteBookId = params.noteBookId.trim();
    }
    const keyword = normalizeKeyword(params.keyword, { max: 100 });
    const keywordRegex = keyword ? toSafeRegex(keyword) : null;
    if (keywordRegex) {
      query.title = keywordRegex;
    }
    if (params.deletedStartTime || params.deletedEndTime) {
      const deletedAt: Record<string, Date> = {};
      if (params.deletedStartTime) {
        deletedAt.$gte = new Date(params.deletedStartTime);
      }
      if (params.deletedEndTime) {
        const endOfRange = new Date(params.deletedEndTime);
        endOfRange.setDate(endOfRange.getDate() + 1);
        deletedAt.$lt = endOfRange;
      }
      query.deletedAt = deletedAt;
    }

    const [items, total] = await Promise.all([
      Note.find(query)
        .select("-content")
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Note.countDocuments(query),
    ]);

    return { items: toLeanNoteArray(items), total };
  }

  static async getTrashNoteById(
    id: string,
    options: { includeExpired?: boolean } = {},
  ): Promise<LeanNote | null> {
    const query: Record<string, unknown> = {
      _id: id,
      isDeleted: true,
    };
    if (!options.includeExpired) {
      query.deleteExpireAt = { $gt: new Date() };
    }
    const note = await Note.findOne(query).lean();
    return note ? toLeanNote(note) : null;
  }

  static async restoreNote(
    id: string,
    targetNoteBookId?: string,
  ): Promise<{
    note: LeanNote;
    restoredToNoteBookId: string;
    restoredToNoteBookTitle: string;
  } | null> {
    const existing = await Note.findOne({ _id: id, isDeleted: true });
    if (!existing) {
      return null;
    }
    const restored = await NoteTrashService.restoreNote(
      id,
      existing.userId,
      targetNoteBookId,
    );
    if (!restored) {
      return null;
    }
    return {
      note: toLeanNote(restored.note.toObject()),
      restoredToNoteBookId: restored.restoredToNoteBookId,
      restoredToNoteBookTitle: restored.restoredToNoteBookTitle,
    };
  }

  static async purgeNote(id: string): Promise<{
    ok: boolean;
    userId?: string;
    title?: string;
  }> {
    const existing = await Note.findOne({ _id: id, isDeleted: true });
    if (!existing) {
      return { ok: false };
    }
    const ok = await NoteTrashService.purgeNote(id, existing.userId);
    if (!ok) {
      return { ok: false };
    }
    return {
      ok: true,
      userId: existing.userId,
      title: existing.title,
    };
  }

  /** 已超过保留期（deleteExpireAt <= now）的软删除手帐 */
  private static expiredTrashQuery(): Record<string, unknown> {
    return {
      isDeleted: true,
      deleteExpireAt: { $lte: new Date() },
    };
  }

  static async countExpiredTrashNotes(): Promise<number> {
    return Note.countDocuments(AdminNoteTrashService.expiredTrashQuery());
  }

  static async purgeExpiredTrashNotes(): Promise<{ purged: number; total: number }> {
    const notes = await Note.find(AdminNoteTrashService.expiredTrashQuery())
      .select("_id userId")
      .lean();
    let purged = 0;
    for (const note of notes) {
      const id = String(note._id);
      const ok = await NoteTrashService.purgeNote(id, note.userId);
      if (ok) {
        purged += 1;
      }
    }
    return { purged, total: notes.length };
  }
}
