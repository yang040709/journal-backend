import NoteBook, { INoteBook, LeanNoteBook } from "../model/NoteBook";
import Note from "../model/Note";
import { ActivityLogger } from "../utils/ActivityLogger";
import { ErrorCodes } from "../utils/response";
import { toLeanNoteBookArray, toLeanNoteBook } from "../utils/typeUtils";

export interface CreateNoteBookData {
  title: string;
  coverImg?: string;
  userId: string;
}

export interface UpdateNoteBookData {
  title?: string;
  coverImg?: string;
  count?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: "asc" | "desc";
}

export class NoteBookService {
  /**
   * 创建手帐本
   */
  static async createNoteBook(data: CreateNoteBookData): Promise<INoteBook> {
    const noteBook = new NoteBook({
      title: data.title,
      coverImg: data.coverImg || "",
      count: 0,
      userId: data.userId,
    });

    await noteBook.save();

    // 记录活动
    ActivityLogger.record(
      {
        type: "create",
        target: "noteBook",
        targetId: noteBook.id,
        title: `创建手帐本：${data.title}`,
        userId: data.userId,
      },
      { blocking: false },
    );

    return noteBook;
  }

  /**
   * 获取用户的手帐本列表
   */
  static async getUserNoteBooks(
    userId: string,
    params: PaginationParams = {},
  ): Promise<{ items: LeanNoteBook[]; total: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const sortField = params.sortBy || "updatedAt";
    const sortOrder = params.order === "asc" ? 1 : -1;

    const [items, total] = await Promise.all([
      NoteBook.find({ userId })
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      NoteBook.countDocuments({ userId }),
    ]);

    return { items: toLeanNoteBookArray(items), total };
  }

  /**
   * 获取单个手帐本
   */
  static async getNoteBookById(
    id: string,
    userId: string,
  ): Promise<LeanNoteBook | null> {
    const noteBook = await NoteBook.findOne({ _id: id, userId }).lean();
    return noteBook ? toLeanNoteBook(noteBook) : null;
  }

  /**
   * 更新手帐本
   */
  static async updateNoteBook(
    id: string,
    userId: string,
    data: UpdateNoteBookData,
  ): Promise<INoteBook | null> {
    const noteBook = await NoteBook.findOne({ _id: id, userId });
    if (!noteBook) {
      return null;
    }

    if (data.title !== undefined) noteBook.title = data.title;
    if (data.coverImg !== undefined) noteBook.coverImg = data.coverImg;
    if (data.count !== undefined) noteBook.count = data.count;

    await noteBook.save();

    // 记录活动
    ActivityLogger.record(
      {
        type: "update",
        target: "noteBook",
        targetId: noteBook.id,
        title: `更新手帐本：${noteBook.title}`,
        userId,
      },
      { blocking: false },
    );

    return noteBook;
  }

  /**
   * 删除手帐本
   */
  static async deleteNoteBook(id: string, userId: string): Promise<boolean> {
    const noteBook = await NoteBook.findOne({ _id: id, userId });
    if (!noteBook) {
      return false;
    }

    // 删除手帐本下的所有手帐
    await Note.deleteMany({ noteBookId: id, userId });

    // 删除手帐本
    await NoteBook.deleteOne({ _id: id, userId });

    // 记录活动
    ActivityLogger.record(
      {
        type: "delete",
        target: "noteBook",
        targetId: id,
        title: `删除手帐本：${noteBook.title}`,
        userId,
      },
      { blocking: false },
    );

    return true;
  }

  /**
   * 获取手帐本统计
   */
  static async getNoteBookStats(
    id: string,
    userId: string,
  ): Promise<{ noteCount: number } | null> {
    const noteBook = await NoteBook.findOne({ _id: id, userId }).lean();
    if (!noteBook) {
      return null;
    }
    // 重新计算手帐数量以确保准确性
    const noteCount = await Note.countDocuments({ noteBookId: id, userId });
    // 如果数量不一致，更新手帐本的数量
    if (noteCount !== noteBook.count) {
      await NoteBook.updateOne({ _id: id }, { count: noteCount });
    }
    return { noteCount };
  }

  /**
   * 验证用户对手帐本的访问权限
   */
  static async validateNoteBookAccess(
    noteBookId: string,
    userId: string,
  ): Promise<boolean> {
    const noteBook = await NoteBook.findOne({ _id: noteBookId, userId });
    return !!noteBook;
  }
}
