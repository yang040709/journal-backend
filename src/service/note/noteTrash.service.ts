import Note, { INote, LeanNote } from "../../model/Note";
import NoteBook from "../../model/NoteBook";
import { toLeanNote, toLeanNoteArray } from "../../utils/typeUtils";
import { MediaReferenceService } from "../mediaReference.service";
import { PaginationParams, MAX_PAGE_DEPTH } from "./note.shared";

export class NoteTrashService {
  static async getTrashNoteById(
    id: string,
    userId: string,
  ): Promise<LeanNote | null> {
    const note = await Note.findOne({
      _id: id,
      userId,
      isDeleted: true,
      deleteExpireAt: { $gt: new Date() },
    }).lean();
    return note ? toLeanNote(note) : null;
  }

  static async getTrashNotes(
    userId: string,
    params: PaginationParams = {},
  ): Promise<{ items: LeanNote[]; total: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    if (page * limit > MAX_PAGE_DEPTH) {
      throw new Error(`分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`);
    }
    const skip = (page - 1) * limit;
    const now = new Date();
    const query = {
      userId,
      isDeleted: true,
      deleteExpireAt: { $gt: now },
    };

    const [items, total] = await Promise.all([
      Note.find(query).sort({ deletedAt: -1 }).skip(skip).limit(limit).lean(),
      Note.countDocuments(query),
    ]);

    return { items: toLeanNoteArray(items), total };
  }

  static async restoreNote(
    id: string,
    userId: string,
    targetNoteBookId?: string,
  ): Promise<{ note: INote; restoredToNoteBookId: string; restoredToNoteBookTitle: string } | null> {
    const note = await Note.findOne({ _id: id, userId, isDeleted: true });
    if (!note) {
      return null;
    }

    const { noteBookId, title } = await NoteTrashService.resolveRestoreNoteBookId(
      userId,
      note.noteBookId,
      targetNoteBookId,
    );
    note.noteBookId = noteBookId;
    note.isDeleted = false;
    note.deletedAt = null;
    note.deleteExpireAt = null;
    await note.save();
    await NoteBook.updateOne({ _id: noteBookId }, { $inc: { count: 1 } });

    return {
      note,
      restoredToNoteBookId: noteBookId,
      restoredToNoteBookTitle: title,
    };
  }

  static async purgeNote(id: string, userId: string): Promise<boolean> {
    const note = await Note.findOne({ _id: id, userId, isDeleted: true });
    if (!note) return false;

    await MediaReferenceService.releaseNoteRefs(userId, id);

    const result = await Note.deleteOne({ _id: id, userId, isDeleted: true });
    return Boolean(result.deletedCount);
  }

  private static async resolveRestoreNoteBookId(
    userId: string,
    currentNoteBookId: string,
    targetNoteBookId?: string,
  ): Promise<{ noteBookId: string; title: string }> {
    if (targetNoteBookId) {
      const target = await NoteBook.findOne({
        _id: targetNoteBookId,
        userId,
        isDeleted: { $ne: true },
      });
      if (!target) {
        throw new Error("目标手帐本不存在或已删除");
      }
      return {
        noteBookId: String(target.id),
        title: target.title,
      };
    }

    const current = await NoteBook.findOne({
      _id: currentNoteBookId,
      userId,
      isDeleted: { $ne: true },
    });
    if (current) {
      return {
        noteBookId: String(current.id),
        title: current.title,
      };
    }

    const fallback = await NoteBook.findOne({
      userId,
      isDeleted: { $ne: true },
    }).sort({ updatedAt: -1 });
    if (fallback) {
      return {
        noteBookId: String(fallback.id),
        title: fallback.title,
      };
    }

    const created = new NoteBook({
      title: "已恢复手帐",
      coverImg: "",
      count: 0,
      userId,
      isDeleted: false,
      deletedAt: null,
      deleteExpireAt: null,
    });
    await created.save();
    return {
      noteBookId: String(created.id),
      title: created.title,
    };
  }
}
