import NoteBook, { INoteBook } from "../model/NoteBook";
import Note from "../model/Note";
import { toLeanNoteBookArray, toLeanNoteBook } from "../utils/typeUtils";
import { LeanNoteBook } from "../types/mongoose";
import { PaginationParams } from "./noteBook.service";
import { ensurePageDepth, pickSortField } from "../utils/querySafety";

export interface AdminCreateNoteBookData {
  title: string;
  coverImg?: string;
  userId: string;
}

export interface AdminUpdateNoteBookData {
  title?: string;
  coverImg?: string;
}

export class AdminNoteBookService {
  static async listNoteBooks(
    params: PaginationParams & { userId?: string } = {},
  ): Promise<{ items: LeanNoteBook[]; total: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    ensurePageDepth({ page, limit });
    const skip = (page - 1) * limit;
    const sortField = pickSortField(
      ["createdAt", "updatedAt", "title", "count"] as const,
      params.sortBy,
      "updatedAt",
    );
    const sortOrder = params.order === "asc" ? 1 : -1;

    const query: Record<string, unknown> = {};
    if (params.userId) {
      query.userId = params.userId;
    }

    const [items, total] = await Promise.all([
      NoteBook.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      NoteBook.countDocuments(query),
    ]);
    return { items: toLeanNoteBookArray(items), total };
  }

  static async getNoteBookById(id: string): Promise<LeanNoteBook | null> {
    const doc = await NoteBook.findById(id).lean();
    return doc ? toLeanNoteBook(doc) : null;
  }

  static async createNoteBook(data: AdminCreateNoteBookData): Promise<INoteBook> {
    const noteBook = new NoteBook({
      title: data.title,
      coverImg: data.coverImg || "",
      count: 0,
      userId: data.userId,
    });
    await noteBook.save();
    return noteBook;
  }

  static async updateNoteBook(
    id: string,
    data: AdminUpdateNoteBookData,
  ): Promise<INoteBook | null> {
    const noteBook = await NoteBook.findById(id);
    if (!noteBook) {
      return null;
    }
    if (data.title !== undefined) noteBook.title = data.title;
    if (data.coverImg !== undefined) noteBook.coverImg = data.coverImg;
    await noteBook.save();
    return noteBook;
  }

  /** 与 C 端一致：删除手帐本及其下所有手帐 */
  static async deleteNoteBook(id: string): Promise<boolean> {
    const noteBook = await NoteBook.findById(id);
    if (!noteBook) {
      return false;
    }
    const userId = noteBook.userId;
    await Note.deleteMany({ noteBookId: id, userId });
    await NoteBook.deleteOne({ _id: id });
    return true;
  }
}
