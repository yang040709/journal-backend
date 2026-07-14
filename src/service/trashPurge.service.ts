import Note from "../model/Note";
import NoteBook from "../model/NoteBook";
import { NoteTrashService } from "./note/noteTrash.service";
import { logger } from "../utils/logger";

export const DEFAULT_TRASH_PURGE_NOTE_LIMIT = 200;
export const DEFAULT_TRASH_PURGE_NOTEBOOK_LIMIT = 100;

function expiredTrashQuery(now = new Date()): Record<string, unknown> {
  return {
    isDeleted: true,
    deleteExpireAt: { $lte: now },
  };
}

export interface TrashPurgeResult {
  notes: { purged: number; total: number; errors: number };
  notebooks: { purged: number; total: number; errors: number };
}

/**
 * 永久清除已超过保留期的软删手帐 / 手帐本。
 * 手帐经 NoteTrashService.purgeNote → MediaReferenceService（引用为 0 才入队 COS）。
 */
export class TrashPurgeService {
  private static inFlight = false;

  static async purgeExpiredTrashNotes(
    limit = DEFAULT_TRASH_PURGE_NOTE_LIMIT,
  ): Promise<{ purged: number; total: number; errors: number }> {
    const notes = await Note.find(expiredTrashQuery())
      .select("_id userId")
      .sort({ deleteExpireAt: 1 })
      .limit(Math.max(1, limit))
      .lean();

    let purged = 0;
    let errors = 0;
    for (const note of notes) {
      try {
        const ok = await NoteTrashService.purgeNote(
          String(note._id),
          String(note.userId),
        );
        if (ok) purged += 1;
      } catch (err) {
        errors += 1;
        logger.error("trash purge note failed", {
          noteId: String(note._id),
          userId: String(note.userId),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { purged, total: notes.length, errors };
  }

  static async purgeExpiredTrashNotebooks(
    limit = DEFAULT_TRASH_PURGE_NOTEBOOK_LIMIT,
  ): Promise<{ purged: number; total: number; errors: number }> {
    const books = await NoteBook.find(expiredTrashQuery())
      .select("_id userId")
      .sort({ deleteExpireAt: 1 })
      .limit(Math.max(1, limit))
      .lean();

    let purged = 0;
    let errors = 0;

    for (const book of books) {
      const bookId = String(book._id);
      const userId = String(book.userId);
      try {
        const softNotes = await Note.find({
          noteBookId: bookId,
          userId,
          isDeleted: true,
        })
          .select("_id")
          .lean();

        for (const note of softNotes) {
          try {
            await NoteTrashService.purgeNote(String(note._id), userId);
          } catch (err) {
            errors += 1;
            logger.error("trash purge note in expired notebook failed", {
              noteId: String(note._id),
              noteBookId: bookId,
              userId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const remainingActive = await Note.countDocuments({
          noteBookId: bookId,
          userId,
          isDeleted: { $ne: true },
        });
        if (remainingActive > 0) {
          logger.warn("skip hard-delete notebook: still has active notes", {
            noteBookId: bookId,
            userId,
            remainingActive,
          });
          continue;
        }

        // 残留软删手帐若 purge 失败也不阻拦删本（本已过期）；再扫一次已无软删则可删
        const remainingSoft = await Note.countDocuments({
          noteBookId: bookId,
          userId,
          isDeleted: true,
        });
        if (remainingSoft > 0) {
          logger.warn("skip hard-delete notebook: soft-deleted notes remain", {
            noteBookId: bookId,
            userId,
            remainingSoft,
          });
          continue;
        }

        const result = await NoteBook.deleteOne({
          _id: bookId,
          userId,
          isDeleted: true,
        });
        if (result.deletedCount) purged += 1;
      } catch (err) {
        errors += 1;
        logger.error("trash purge notebook failed", {
          noteBookId: bookId,
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { purged, total: books.length, errors };
  }

  /** 先清过期手帐，再清过期手帐本（本内残留软删文一并 purge） */
  static async runWeeklyPurge(options?: {
    noteLimit?: number;
    notebookLimit?: number;
  }): Promise<TrashPurgeResult> {
    if (TrashPurgeService.inFlight) {
      logger.info("trash purge skipped: already in flight");
      return {
        notes: { purged: 0, total: 0, errors: 0 },
        notebooks: { purged: 0, total: 0, errors: 0 },
      };
    }

    TrashPurgeService.inFlight = true;
    try {
      const notes = await TrashPurgeService.purgeExpiredTrashNotes(
        options?.noteLimit ?? DEFAULT_TRASH_PURGE_NOTE_LIMIT,
      );
      const notebooks = await TrashPurgeService.purgeExpiredTrashNotebooks(
        options?.notebookLimit ?? DEFAULT_TRASH_PURGE_NOTEBOOK_LIMIT,
      );
      logger.info("trash weekly purge finished", { notes, notebooks });
      return { notes, notebooks };
    } finally {
      TrashPurgeService.inFlight = false;
    }
  }

  static countExpiredTrashNotes(): Promise<number> {
    return Note.countDocuments(expiredTrashQuery());
  }
}
