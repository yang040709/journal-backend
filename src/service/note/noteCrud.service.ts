import Note, { INote, LeanNote } from "../../model/Note";
import NoteBook from "../../model/NoteBook";
import { ActivityLogger } from "../../utils/ActivityLogger";
import { toLeanNote } from "../../utils/typeUtils";
import {
  queueContentPreviewBackfill,
  toLeanNoteListItems,
} from "../../utils/noteListItem";
import { nanoid } from "nanoid";
import { recordFromNoteImages } from "../userImageAsset.service";
import { MediaReferenceService } from "../mediaReference.service";
import { ReadingThemeCatalogConfigService } from "../readingThemeCatalogConfig.service";
import { assertReadingThemeSelectionAllowed } from "../../utils/readingThemeCatalog";
import { ReadingThemeChangeLogService } from "../readingThemeChangeLog.service";
import {
  CreateNoteData,
  UpdateNoteData,
  PaginationParams,
  sanitizeNoteTags,
  buildNoteListSortClause,
  MAX_PAGE_DEPTH,
  MAX_PINNED_PER_NOTEBOOK,
  NotePinLimitExceededError,
  getTrashExpireAt,
} from "./note.shared";

export class NoteCrudService {
  /**
   * 创建手帐
   */
  static async createNote(data: CreateNoteData): Promise<INote> {
    // 验证手帐本是否存在且属于该用户
    const noteBook = await NoteBook.findOne({
      _id: data.noteBookId,
      userId: data.userId,
      isDeleted: { $ne: true },
    });
    if (!noteBook) {
      throw new Error("手帐本不存在或无权访问");
    }

    const key = data.appliedSystemTemplateKey?.trim();
    const tags = sanitizeNoteTags(data.tags || []);
    const note = new Note({
      noteBookId: data.noteBookId,
      title: data.title,
      content: data.content,
      tags,
      images: data.images || [],
      userId: data.userId,
      isShare: false,
      shareId: nanoid(12),
      shareVersion: 0,
      ...(key ? { appliedSystemTemplateKey: key.slice(0, 120) } : {}),
      isDeleted: false,
      deletedAt: null,
      deleteExpireAt: null,
    });

    await note.save();

    // 更新手帐本的手帐数量（不刷新手帐本 updatedAt）
    await NoteBook.updateOne(
      { _id: data.noteBookId },
      { $inc: { count: 1 } },
      { timestamps: false },
    );

    // 记录活动
    void ActivityLogger.record(
      {
        type: "create",
        target: "note",
        targetId: note.id,
        title: `创建手帐：${data.title}`,
        userId: data.userId,
      },
      { blocking: false },
    );

    recordFromNoteImages(data.userId, String(note.id), data.images || []);
    void MediaReferenceService.syncNoteImages(
      data.userId,
      String(note.id),
      data.images || [],
    );

    return note;
  }

  /**
   * 获取手帐列表
   */
  static async getNotes(
    userId: string,
    params: PaginationParams & { noteBookId?: string } = {},
  ): Promise<{ items: LeanNote[]; total: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    if (page * limit > MAX_PAGE_DEPTH) {
      throw new Error(`分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`);
    }
    const skip = (page - 1) * limit;

    const sortClause = buildNoteListSortClause({
      noteBookId: params.noteBookId,
      favoriteOnly: params.favoriteOnly,
      sortBy: params.sortBy,
      order: params.order,
    });

    // 构建查询条件
    const query: any = { userId, isDeleted: { $ne: true } };

    if (params.favoriteOnly) {
      query.isFavorite = true;
    }

    // 手帐本筛选
    if (params.noteBookId) {
      query.noteBookId = params.noteBookId;
    }

    // 标签筛选
    if (params.tags && params.tags.length > 0) {
      query.tags = { $all: params.tags };
    }

    // 时间范围筛选
    if (params.startTime || params.endTime) {
      query.createdAt = {};
      if (params.startTime) {
        query.createdAt.$gte = new Date(params.startTime);
      }
      if (params.endTime) {
        const endOfRange = new Date(params.endTime);
        endOfRange.setDate(endOfRange.getDate() + 1);
        query.createdAt.$lt = endOfRange;
      }
    }

    const [rawItems, total] = await Promise.all([
      Note.find(query).sort(sortClause).skip(skip).limit(limit).lean(),
      Note.countDocuments(query),
    ]);

    queueContentPreviewBackfill(rawItems);
    return { items: toLeanNoteListItems(rawItems), total };
  }

  /**
   * 获取单个手帐
   */
  static async getNoteById(
    id: string,
    userId: string,
  ): Promise<LeanNote | null> {
    const note = await Note.findOne({ _id: id, userId, isDeleted: { $ne: true } }).lean();
    return note ? toLeanNote(note) : null;
  }

  /**
   * 更新手帐
   */
  static async updateNote(
    id: string,
    userId: string,
    data: UpdateNoteData,
  ): Promise<INote | null> {
    const note = await Note.findOne({ _id: id, userId, isDeleted: { $ne: true } });
    if (!note) {
      return null;
    }

    // 如果更换手帐本，需要更新两个手帐本的计数
    if (data.noteBookId && data.noteBookId !== note.noteBookId) {
      const oldNoteBookId = note.noteBookId;
      const newNoteBookId = data.noteBookId;

      // 验证新手帐本是否存在且属于该用户
      const newNoteBook = await NoteBook.findOne({
        _id: newNoteBookId,
        userId,
        isDeleted: { $ne: true },
      });
      if (!newNoteBook) {
        throw new Error("目标手帐本不存在或无权访问");
      }

      // 更新手帐本计数（不刷新手帐本 updatedAt）
      await Promise.all([
        NoteBook.updateOne(
          { _id: oldNoteBookId },
          { $inc: { count: -1 } },
          { timestamps: false },
        ),
        NoteBook.updateOne(
          { _id: newNoteBookId },
          { $inc: { count: 1 } },
          { timestamps: false },
        ),
      ]);

      note.noteBookId = newNoteBookId;
      note.isPinned = false;
      note.pinnedAt = null;
    }

    if (data.title !== undefined) note.title = data.title;
    if (data.content !== undefined) note.content = data.content;
    if (data.tags !== undefined) {
      note.tags = sanitizeNoteTags(data.tags);
    }
    if (data.images !== undefined) note.images = data.images;

    if (data.isFavorite !== undefined) {
      note.isFavorite = data.isFavorite;
      note.favoritedAt = data.isFavorite ? new Date() : null;
    }

    if (data.isPinned !== undefined) {
      if (data.isPinned) {
        const wasPinned = Boolean(note.isPinned);
        if (!wasPinned) {
          const pinnedCount = await Note.countDocuments({
            userId,
            noteBookId: note.noteBookId,
            isPinned: true,
            isDeleted: { $ne: true },
            _id: { $ne: note._id },
          });
          if (pinnedCount >= MAX_PINNED_PER_NOTEBOOK) {
            throw new NotePinLimitExceededError();
          }
        }
        note.isPinned = true;
        if (!wasPinned) {
          note.pinnedAt = new Date();
        }
      } else {
        note.isPinned = false;
        note.pinnedAt = null;
      }
    }

    if (data.readingStyleKey !== undefined || data.readingThemeId !== undefined) {
      const beforeThemeSelection = {
        readingStyleKey: note.readingStyleKey ?? null,
        readingThemeId: note.readingThemeId ?? null,
      };

      if (data.readingStyleKey !== undefined) {
        note.readingStyleKey = data.readingStyleKey;
        if (data.readingStyleKey === null) {
          note.readingThemeId = null;
        }
      }

      if (data.readingThemeId !== undefined) {
        note.readingThemeId =
          note.readingStyleKey === null || note.readingStyleKey === undefined
            ? null
            : data.readingThemeId;
      }

      const effectiveStyleKey = note.readingStyleKey;
      const effectiveThemeId = note.readingThemeId;
      const systemCatalog = await ReadingThemeCatalogConfigService.getSystemCatalog();
      assertReadingThemeSelectionAllowed(
        effectiveStyleKey,
        effectiveThemeId,
        systemCatalog,
      );

      await ReadingThemeChangeLogService.recordChange(
        userId,
        "note",
        beforeThemeSelection,
        {
          readingStyleKey: note.readingStyleKey ?? null,
          readingThemeId: note.readingThemeId ?? null,
        },
        String(note._id),
      );
    }

    const shouldBumpUpdatedAt =
      data.title !== undefined ||
      data.content !== undefined ||
      data.tags !== undefined ||
      data.images !== undefined ||
      data.noteBookId !== undefined;

    if (shouldBumpUpdatedAt) {
      await note.save();
    } else {
      await note.save({ timestamps: false });
    }

    // 记录活动
    void ActivityLogger.record(
      {
        type: "update",
        target: "note",
        targetId: note.id,
        title: `更新手帐：${note.title}`,
        userId,
      },
      { blocking: false },
    );

    if (data.images !== undefined) {
      recordFromNoteImages(userId, String(note.id), data.images);
      void MediaReferenceService.syncNoteImages(
        userId,
        String(note.id),
        data.images,
      );
    }

    return note;
  }

  /**
   * 删除手帐
   */
  static async deleteNote(id: string, userId: string): Promise<boolean> {
    const note = await Note.findOne({ _id: id, userId, isDeleted: { $ne: true } });
    if (!note) {
      return false;
    }

    const deletedAt = new Date();
    const deleteExpireAt = getTrashExpireAt(deletedAt);
    await Note.updateOne(
      { _id: id, userId, isDeleted: { $ne: true } },
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

    // 更新手帐本的手帐数量
    await NoteBook.updateOne(
      { _id: note.noteBookId },
      { $inc: { count: -1 } },
      { timestamps: false },
    );

    // 记录活动
    void ActivityLogger.record(
      {
        type: "delete",
        target: "note",
        targetId: id,
        title: `删除手帐：${note.title}`,
        userId,
      },
      { blocking: false },
    );

    return true;
  }

  /**
   * 批量删除手帐
   */
  static async batchDeleteNotes(
    noteIds: string[],
    userId: string,
  ): Promise<number> {
    if (!noteIds.length) {
      return 0;
    }

    // 获取要删除的手帐信息，以便更新手帐本计数
    const notes = await Note.find({
      _id: { $in: noteIds },
      userId,
      isDeleted: { $ne: true },
    });
    if (!notes.length) {
      return 0;
    }

    // 按手帐本分组统计
    const noteBookCounts: Record<string, number> = {};
    notes.forEach((note) => {
      noteBookCounts[note.noteBookId] =
        (noteBookCounts[note.noteBookId] || 0) + 1;
    });

    const deletedAt = new Date();
    const deleteExpireAt = getTrashExpireAt(deletedAt);
    const result = await Note.updateMany(
      { _id: { $in: noteIds }, userId, isDeleted: { $ne: true } },
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

    // 更新手帐本计数
    const updatePromises = Object.entries(noteBookCounts).map(
      ([noteBookId, count]) =>
        NoteBook.updateOne(
          { _id: noteBookId },
          { $inc: { count: -count } },
          { timestamps: false },
        ),
    );
    await Promise.all(updatePromises);

    // 记录活动
    void ActivityLogger.record(
      {
        type: "delete",
        target: "note",
        targetId: "batch",
        title: `批量删除手帐：共删除${result.modifiedCount || 0}条`,
        userId,
      },
      { blocking: false },
    );

    return result.modifiedCount || 0;
  }

  /**
   * 验证用户对手帐的访问权限
   */
  static async validateNoteAccess(
    noteId: string,
    userId: string,
  ): Promise<boolean> {
    const note = await Note.findOne({ _id: noteId, userId, isDeleted: { $ne: true } });
    return !!note;
  }
}
