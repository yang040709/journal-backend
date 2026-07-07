import Note, { LeanNote } from "../../model/Note";
import {
  queueContentPreviewBackfill,
  toLeanNoteListItems,
} from "../../utils/noteListItem";
import {
  SearchParams,
  SearchNotesResult,
  buildNoteListSortClause,
  MAX_PAGE_DEPTH,
  MIN_SEARCH_KEYWORD_LENGTH,
} from "./note.shared";

export class NoteSearchService {
  /**
   * 搜索手帐（分页）
   */
  static async searchNotes(
    userId: string,
    params: SearchParams,
  ): Promise<SearchNotesResult> {
    const query: any = { userId, isDeleted: { $ne: true } };

    // 文本搜索 - 使用正则表达式替代 $text
    if (params.q) {
      const keyword = params.q.trim();
      if (keyword) {
        if (keyword.length < MIN_SEARCH_KEYWORD_LENGTH) {
          throw new Error(`搜索关键词至少 ${MIN_SEARCH_KEYWORD_LENGTH} 个字符`);
        }
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

    if (params.favoriteOnly) {
      query.isFavorite = true;
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

    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
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

    const total = await Note.countDocuments(query);

    const notes = await Note.find(query)
      .sort(sortClause)
      .skip(skip)
      .limit(limit)
      .lean();

    queueContentPreviewBackfill(notes);
    return {
      items: toLeanNoteListItems(notes),
      total,
    };
  }

  /**
   * 获取最近更新的手帐
   */
  static async getRecentNotes(
    userId: string,
    limit: number = 10,
  ): Promise<LeanNote[]> {
    const notes = await Note.find({ userId, isDeleted: { $ne: true } })
      .sort({ updatedAt: -1 })
      .limit(Math.min(limit, 100))
      .lean();

    queueContentPreviewBackfill(notes);
    return toLeanNoteListItems(notes);
  }
}
