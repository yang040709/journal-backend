import Note, { INote, LeanNote } from "../model/Note";
import NoteBook, { LeanNoteBook } from "../model/NoteBook";
import Activity from "../model/Activity";
import { ErrorCodes } from "../utils/response";
import { toLeanNoteArray, toLeanNote } from "../utils/typeUtils";
import { checkNoteContent } from "../utils/sensitive-encrypted";
import { nanoid } from "nanoid";

export interface CreateNoteData {
  noteBookId: string;
  title: string;
  content: string;
  tags?: string[];
  userId: string;
}

export interface UpdateNoteData {
  title?: string;
  content?: string;
  tags?: string[];
  noteBookId?: string;
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
}

export interface SearchParams {
  q: string;
  noteBookId?: string;
  tags?: string[];
  startTime?: number;
  endTime?: number;
}

export class NoteService {
  /**
   * 创建手帐
   */
  static async createNote(data: CreateNoteData): Promise<INote> {
    // 验证手帐本是否存在且属于该用户
    const noteBook = await NoteBook.findOne({
      _id: data.noteBookId,
      userId: data.userId,
    });
    if (!noteBook) {
      throw new Error("手帐本不存在或无权访问");
    }

    const note = new Note({
      noteBookId: data.noteBookId,
      title: data.title,
      content: data.content,
      tags: data.tags || [],
      userId: data.userId,
    });

    await note.save();

    // 更新手帐本的手帐数量
    await NoteBook.updateOne({ _id: data.noteBookId }, { $inc: { count: 1 } });

    // 记录活动
    Activity.create({
      type: "create",
      target: "note",
      targetId: note.id,
      title: `创建手帐：${data.title}`,
      userId: data.userId,
    });

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
    const skip = (page - 1) * limit;

    const sortField = params.sortBy || "updatedAt";
    const sortOrder = params.order === "asc" ? 1 : -1;

    // 构建查询条件
    const query: any = { userId };

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

    const [items, total] = await Promise.all([
      Note.find(query)
        .select("-content") // 排除 content 字段，减少网络传输
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Note.countDocuments(query),
    ]);

    return { items: toLeanNoteArray(items), total };
  }

  /**
   * 获取单个手帐
   */
  static async getNoteById(
    id: string,
    userId: string,
  ): Promise<LeanNote | null> {
    const note = await Note.findOne({ _id: id, userId }).lean();
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
    const note = await Note.findOne({ _id: id, userId });
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
      });
      if (!newNoteBook) {
        throw new Error("目标手帐本不存在或无权访问");
      }

      // 更新手帐本计数
      await Promise.all([
        NoteBook.updateOne({ _id: oldNoteBookId }, { $inc: { count: -1 } }),
        NoteBook.updateOne({ _id: newNoteBookId }, { $inc: { count: 1 } }),
      ]);

      note.noteBookId = newNoteBookId;
    }

    if (data.title !== undefined) note.title = data.title;
    if (data.content !== undefined) note.content = data.content;
    if (data.tags !== undefined) note.tags = data.tags;

    await note.save();

    // 记录活动
    await Activity.create({
      type: "update",
      target: "note",
      targetId: note.id,
      title: `更新手帐：${note.title}`,
      userId,
    });

    return note;
  }

  /**
   * 删除手帐
   */
  static async deleteNote(id: string, userId: string): Promise<boolean> {
    const note = await Note.findOne({ _id: id, userId });
    if (!note) {
      return false;
    }

    // 删除手帐
    await Note.deleteOne({ _id: id, userId });

    // 更新手帐本的手帐数量
    await NoteBook.updateOne({ _id: note.noteBookId }, { $inc: { count: -1 } });

    // 记录活动
    await Activity.create({
      type: "delete",
      target: "note",
      targetId: id,
      title: `删除手帐：${note.title}`,
      userId,
    });

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
    const notes = await Note.find({ _id: { $in: noteIds }, userId });
    if (!notes.length) {
      return 0;
    }

    // 按手帐本分组统计
    const noteBookCounts: Record<string, number> = {};
    notes.forEach((note) => {
      noteBookCounts[note.noteBookId] =
        (noteBookCounts[note.noteBookId] || 0) + 1;
    });

    // 批量删除手帐
    const result = await Note.deleteMany({ _id: { $in: noteIds }, userId });

    // 更新手帐本计数
    const updatePromises = Object.entries(noteBookCounts).map(
      ([noteBookId, count]) =>
        NoteBook.updateOne({ _id: noteBookId }, { $inc: { count: -count } }),
    );
    await Promise.all(updatePromises);

    // 记录活动
    await Activity.create({
      type: "delete",
      target: "note",
      targetId: "batch",
      title: `批量删除手帐：共删除${result.deletedCount}条`,
      userId,
    });

    return result.deletedCount || 0;
  }

  /**
   * 搜索手帐
   */
  static async searchNotes(
    userId: string,
    params: SearchParams,
  ): Promise<LeanNote[]> {
    const query: any = { userId };

    // 文本搜索 - 使用正则表达式替代 $text
    if (params.q) {
      const keyword = params.q.trim();
      if (keyword) {
        // 转义正则特殊字符，防止注入或报错
        const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const searchRegex = new RegExp(safeKeyword, "i"); // i = 忽略大小写
        query.$or = [{ title: searchRegex }, { content: searchRegex }];
      }
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
        query.createdAt.$lte = new Date(params.endTime);
      }
    }

    const notes = await Note.find(query)
      .select("-content") // 排除 content 字段，减少网络传输
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    return toLeanNoteArray(notes);
  }

  /**
   * 获取最近更新的手帐
   */
  static async getRecentNotes(
    userId: string,
    limit: number = 10,
  ): Promise<LeanNote[]> {
    const notes = await Note.find({ userId })
      .select("-content") // 排除 content 字段，减少网络传输
      .sort({ updatedAt: -1 })
      .limit(Math.min(limit, 100))
      .lean();

    return toLeanNoteArray(notes);
  }

  /**
   * 验证用户对手帐的访问权限
   */
  static async validateNoteAccess(
    noteId: string,
    userId: string,
  ): Promise<boolean> {
    const note = await Note.findOne({ _id: noteId, userId });
    return !!note;
  }

  /**
   * 通过shareId获取分享的手帐
   * @param shareId 分享ID
   * @returns 手帐信息，如果不存在或未分享则返回null
   */
  static async getNoteByShareId(shareId: string): Promise<LeanNote | null> {
    const note = await Note.findOne({
      shareId,
      isShare: true,
    }).lean();

    return note ? toLeanNote(note) : null;
  }

  /**
   * 设置手帐分享状态
   * @param noteId 手帐ID
   * @param userId 用户ID
   * @param share 是否分享
   * @returns 更新后的手帐信息，如果手帐不存在则返回null
   */
  static async setNoteShareStatus(
    noteId: string,
    userId: string,
    share: boolean,
  ): Promise<INote | null> {
    const note = await Note.findOne({ _id: noteId, userId });
    if (!note) {
      return null;
    }

    // 生成shareId（如果还没有）
    if (!note.shareId) {
      note.shareId = nanoid(12); // 生成12位的唯一ID
    }

    if (share) {
      // 开启分享
      // 检查敏感词
      const checkResult = checkNoteContent(note.title, note.content);

      // 如果有敏感词，使用处理后的内容
      if (checkResult.hasAnySensitive) {
        note.title = checkResult.processedTitle;
        note.content = checkResult.processedContent;
      }
      note.isShare = true;
    } else {
      // 关闭分享
      note.isShare = false;
      // 注意：不删除shareId，以便重新开启时使用同一个分享链接
    }

    await note.save({ timestamps: false }); // 不更新updatedAt

    // 记录活动
    await Activity.create({
      type: share ? "share_enable" : "share_disable",
      target: "note",
      targetId: note.id,
      title: share
        ? `开启手帐分享：${note.title}`
        : `关闭手帐分享：${note.title}`,
      userId,
    });

    return note;
  }

  /**
   * 生成唯一的shareId
   * @returns 唯一的shareId
   */
  static generateShareId(): string {
    return nanoid(12);
  }

  /**
   * 获取用户的分享手帐列表
   * @param userId 用户ID
   * @returns 分享的手帐列表
   */
  static async getSharedNotes(userId: string): Promise<LeanNote[]> {
    const notes = await Note.find({
      userId,
      isShare: true,
    })
      .select("-content") // 排除 content 字段，减少网络传输
      .sort({ updatedAt: -1 })
      .lean();

    return toLeanNoteArray(notes);
  }
}
