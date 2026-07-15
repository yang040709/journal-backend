import NoteBook, { INoteBook, LeanNoteBook } from "../model/NoteBook";
import Note from "../model/Note";
import { ActivityLogger } from "../utils/ActivityLogger";
import { toLeanNoteBookArray, toLeanNoteBook } from "../utils/typeUtils";
import { ensurePageDepth, pickSortField } from "../utils/querySafety";
import { getTrashExpireAt } from "./note/note.shared";
import { NotebookLimitsService } from "./notebookLimits.service";

export interface CreateNoteBookData {
  title: string;
  coverImg?: string;
  userId: string;
}

export const createNotebookLimitExceededError = (max: number): Error => {
  const err = new Error(
    `手帐本数量已达到上限（${max}个），无法继续添加`,
  );
  (err as Error & { code: string }).code = "NOTEBOOK_LIMIT_EXCEEDED";
  return err;
};

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
    const effectiveMax =
      await NotebookLimitsService.getEffectiveMaxNoteBookCount();
    const liveCount = await NoteBook.countDocuments({
      userId: data.userId,
      isDeleted: { $ne: true },
    });
    if (liveCount >= effectiveMax) {
      throw createNotebookLimitExceededError(effectiveMax);
    }

    const noteBook = new NoteBook({
      title: data.title,
      coverImg: data.coverImg || "",
      count: 0,
      userId: data.userId,
      isDeleted: false,
      deletedAt: null,
      deleteExpireAt: null,
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
  ): Promise<{
    items: LeanNoteBook[];
    total: number;
    maxNoteBookCount: number;
  }> {
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

    const [items, total, maxNoteBookCount] = await Promise.all([
      NoteBook.find({ userId, isDeleted: { $ne: true } })
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      NoteBook.countDocuments({ userId, isDeleted: { $ne: true } }),
      NotebookLimitsService.getEffectiveMaxNoteBookCount(),
    ]);

    return {
      items: toLeanNoteBookArray(items),
      total,
      maxNoteBookCount,
    };
  }

  /**
   * 获取单个手帐本
   */
  static async getNoteBookById(
    id: string,
    userId: string,
  ): Promise<LeanNoteBook | null> {
    const noteBook = await NoteBook.findOne({
      _id: id,
      userId,
      isDeleted: { $ne: true },
    }).lean();
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
    const noteBook = await NoteBook.findOne({
      _id: id,
      userId,
      isDeleted: { $ne: true },
    });
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
    const noteBook = await NoteBook.findOne({
      _id: id,
      userId,
      isDeleted: { $ne: true },
    });
    if (!noteBook) {
      return false;
    }

    const deletedAt = new Date();
    const deleteExpireAt = getTrashExpireAt(deletedAt);

    const notesToSoftDelete = await Note.find({
      noteBookId: id,
      userId,
      isDeleted: { $ne: true },
    })
      .select("_id")
      .lean();
    const noteIds = notesToSoftDelete.map((n) => String(n._id));

    await NoteBook.updateOne(
      { _id: id, userId, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt, deleteExpireAt, count: 0 } },
      { timestamps: false },
    );
    await Note.updateMany(
      { noteBookId: id, userId, isDeleted: { $ne: true } },
      {
        $set: {
          isDeleted: true,
          deletedAt,
          deleteExpireAt,
          isShare: false,
        },
      },
      { timestamps: false },
    );

    if (noteIds.length) {
      const { ReminderService } = await import("./reminder.service");
      await ReminderService.markUnavailableByNoteIds(noteIds, userId);
      const { ShareSecurityTaskService } = await import(
        "./shareSecurityTask.service"
      );
      await ShareSecurityTaskService.cancelByNoteIds(noteIds, userId);
    }

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
    const noteBook = await NoteBook.findOne({
      _id: id,
      userId,
      isDeleted: { $ne: true },
    }).lean();
    if (!noteBook) {
      return null;
    }
    // 重新计算手帐数量以确保准确性
    const noteCount = await Note.countDocuments({
      noteBookId: id,
      userId,
      isDeleted: { $ne: true },
    });
    // 如果数量不一致，更新手帐本的数量（不刷新手帐本 updatedAt）
    if (noteCount !== noteBook.count) {
      await NoteBook.updateOne(
        { _id: id },
        { count: noteCount },
        { timestamps: false },
      );
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
    const noteBook = await NoteBook.findOne({
      _id: noteBookId,
      userId,
      isDeleted: { $ne: true },
    });
    return !!noteBook;
  }
}
