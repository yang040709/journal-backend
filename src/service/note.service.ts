import Note, { INote, INoteImage, LeanNote } from "../model/Note";
import NoteBook, { LeanNoteBook } from "../model/NoteBook";
import { ActivityLogger } from "../utils/ActivityLogger";
import { toLeanNoteArray, toLeanNote } from "../utils/typeUtils";
import { checkNoteContent } from "../utils/sensitive-encrypted";
import { nanoid } from "nanoid";
import { recordFromNoteImages } from "./userImageAsset.service";
import { ShareSecurityTaskService } from "./shareSecurityTask.service";

export interface CreateNoteData {
  noteBookId: string;
  title: string;
  content: string;
  tags?: string[];
  images?: INoteImage[];
  userId: string;
  /** 可选：来自系统模板时传 Template.systemKey */
  appliedSystemTemplateKey?: string;
}

export interface UpdateNoteData {
  title?: string;
  content?: string;
  tags?: string[];
  noteBookId?: string;
  images?: INoteImage[];
  isFavorite?: boolean;
  isPinned?: boolean;
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
  /** 仅返回已收藏手帐 */
  favoriteOnly?: boolean;
}

export interface SearchParams {
  q: string;
  page?: number;
  limit?: number;
  noteBookId?: string;
  tags?: string[];
  startTime?: number;
  endTime?: number;
  favoriteOnly?: boolean;
  sortBy?: string;
  order?: "asc" | "desc";
}

/** 公开分享接口返回体：不暴露 userId 等账号字段；isOwner 由服务端根据可选 JWT 计算 */
export interface SharedNoteView {
  id: string;
  title: string;
  content: string;
  tags: string[];
  images: INoteImage[];
  createdAt: unknown;
  updatedAt: unknown;
  isOwner: boolean;
}

export class ShareAccessError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** 手帐本内置顶条数超过上限 */
export class NotePinLimitExceededError extends Error {
  constructor(message: string = "置顶数量已达上限，请先取消其他置顶") {
    super(message);
    this.name = "NotePinLimitExceededError";
  }
}

export function toSharedNoteView(
  lean: LeanNote,
  viewerUserId?: string | null,
): SharedNoteView {
  return {
    id: lean.id,
    title: lean.title,
    content: lean.content,
    tags: lean.tags ?? [],
    images: lean.images ?? [],
    createdAt: lean.createdAt,
    updatedAt: lean.updatedAt,
    isOwner: Boolean(
      viewerUserId && lean.userId && viewerUserId === lean.userId,
    ),
  };
}

export interface SearchNotesResult {
  items: LeanNote[];
  total: number;
}

const TRASH_RETAIN_DAYS = 7;
const NOTE_TAG_MAX_LENGTH = 20;
const NOTE_TAG_MAX_COUNT = 100;
const MAX_PAGE_DEPTH = 10_000;
const MIN_SEARCH_KEYWORD_LENGTH = 1;
const WECHAT_OPENID_PATTERN = /^o[A-Za-z0-9_-]{15,63}$/;
const MAX_PINNED_PER_NOTEBOOK = 5;

type NoteListSortField = "createdAt" | "updatedAt" | "title" | "favoritedAt";

/** 列表/搜索统一排序：有 noteBookId 时置顶优先；收藏列表未指定 sortBy 时默认 favoritedAt desc */
function buildNoteListSortClause(opts: {
  noteBookId?: string;
  favoriteOnly?: boolean;
  sortBy?: string;
  order?: "asc" | "desc";
}): Record<string, 1 | -1> {
  const favoriteOnly = Boolean(opts.favoriteOnly);
  let sortField = (opts.sortBy ?? "").trim();
  let sortOrder: 1 | -1 = opts.order === "asc" ? 1 : -1;

  if (favoriteOnly && !sortField) {
    sortField = "favoritedAt";
    sortOrder = -1;
  }
  if (!sortField) {
    sortField = "updatedAt";
  }

  const allowed: NoteListSortField[] = [
    "createdAt",
    "updatedAt",
    "title",
    "favoritedAt",
  ];
  const sf = (
    allowed.includes(sortField as NoteListSortField)
      ? sortField
      : "updatedAt"
  ) as NoteListSortField;

  const secondary: Record<string, 1 | -1> = { [sf]: sortOrder };

  if (opts.noteBookId) {
    return {
      isPinned: -1,
      pinnedAt: -1,
      ...secondary,
    };
  }
  return secondary;
}

function isLikelyWeChatOpenId(value: unknown): boolean {
  const id = String(value || "").trim();
  return WECHAT_OPENID_PATTERN.test(id);
}

function sanitizeNoteTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const s = String(raw ?? "").trim();
    if (!s || seen.has(s)) continue;
    if (s.length > NOTE_TAG_MAX_LENGTH) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= NOTE_TAG_MAX_COUNT) break;
  }
  return out;
}

export class NoteService {
  private static getTrashExpireAt(base: Date = new Date()): Date {
    return new Date(base.getTime() + TRASH_RETAIN_DAYS * 24 * 60 * 60 * 1000);
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

    // 更新手帐本的手帐数量
    await NoteBook.updateOne({ _id: data.noteBookId }, { $inc: { count: 1 } });

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

    const [items, total] = await Promise.all([
      Note.find(query)
        .select("-content") // 排除 content 字段，减少网络传输
        .sort(sortClause)
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
    const note = await Note.findOne({ _id: id, userId, isDeleted: { $ne: true } }).lean();
    return note ? toLeanNote(note) : null;
  }

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

      // 更新手帐本计数
      await Promise.all([
        NoteBook.updateOne({ _id: oldNoteBookId }, { $inc: { count: -1 } }),
        NoteBook.updateOne({ _id: newNoteBookId }, { $inc: { count: 1 } }),
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
    const previousImages = data.images !== undefined ? [...(note.images || [])] : null;
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

    if (data.images !== undefined && previousImages) {
      const oldKeys = new Set(previousImages.map((i) => i.key));
      const added = data.images.filter((i) => !oldKeys.has(i.key));
      recordFromNoteImages(userId, String(note.id), added);
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
    const deleteExpireAt = NoteService.getTrashExpireAt(deletedAt);
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
    const deleteExpireAt = NoteService.getTrashExpireAt(deletedAt);
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
      .select("-content") // 排除 content 字段，减少网络传输
      .sort(sortClause)
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      items: toLeanNoteArray(notes),
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
    const note = await Note.findOne({ _id: noteId, userId, isDeleted: { $ne: true } });
    return !!note;
  }

  /**
   * 通过 shareId 获取分享页展示数据（不含 userId；isOwner 依赖可选登录）
   */
  static async getSharedNoteForPublic(
    shareId: string,
    viewerUserId?: string | null,
  ): Promise<SharedNoteView | null> {
    const raw = await Note.findOne({ shareId }).lean();
    if (!raw) {
      throw new ShareAccessError("SHARE_NOT_FOUND", "分享链接不存在或已失效");
    }
    const note = toLeanNote(raw);
    if (note.isDeleted) {
      throw new ShareAccessError("SHARE_NOTE_DELETED", "该手帐已删除，暂时无法查看");
    }
    if (!note.isShare) {
      const risk = await ShareSecurityTaskService.getLatestRiskSummary(note.id);
      if (risk.riskStatus === "reject_local") {
        throw new ShareAccessError("SHARE_DISABLED_BY_LOCAL_RISK", "该手帐因内容风险已关闭分享");
      }
      if (risk.riskStatus === "reject_wechat") {
        throw new ShareAccessError(
          "SHARE_DISABLED_BY_WECHAT_RISK",
          "该手帐因微信图文风控检测结果已关闭分享",
        );
      }
      throw new ShareAccessError("SHARE_DISABLED_BY_AUTHOR", "该手帐已被作者关闭分享");
    }
    return toSharedNoteView(note, viewerUserId);
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
    const note = await Note.findOne({ _id: noteId, userId, isDeleted: { $ne: true } });
    if (!note) {
      return null;
    }

    // 生成shareId（如果还没有）
    if (!note.shareId) {
      note.shareId = nanoid(12); // 生成12位的唯一ID
    }

    if (share) {
      const checkResult = checkNoteContent(note.title, note.content);
      if (checkResult.hasAnySensitive) {
        note.isShare = false;
        await note.save({ timestamps: false });
        await ShareSecurityTaskService.recordLocalReject({
          noteId: String(note.id),
          userId,
          shareVersion: Number(note.shareVersion || 0),
          reason: "LOCAL_SENSITIVE_WORD",
          title: note.title,
          content: note.content,
          tags: note.tags || [],
          images: (note.images || []).map((image) => ({
            key: image.key,
            url: image.url,
            thumbUrl: image.thumbUrl,
          })),
        });
        throw new ShareAccessError(
          "SHARE_LOCAL_RISK_BLOCKED",
          "内容包含违规敏感信息，当前手帐分享已关闭",
        );
      }
      note.isShare = true;
      note.shareVersion = Number(note.shareVersion || 0) + 1;
      if (!note.firstSharedAt) note.firstSharedAt = new Date();
      await note.save({ timestamps: false });
      // 仅在 userId 是微信 openid 时提交微信风控队列，避免非微信端账号误判。
      if (isLikelyWeChatOpenId(userId)) {
        await ShareSecurityTaskService.enqueueWeChatChecks({
          noteId: String(note.id),
          userId,
          shareVersion: note.shareVersion,
          title: note.title,
          content: note.content,
          tags: note.tags || [],
          images: (note.images || []).map((image) => ({
            key: image.key,
            url: image.url,
            thumbUrl: image.thumbUrl,
          })),
        });
      }
    } else {
      // 关闭分享
      note.isShare = false;
      // 注意：不删除shareId，以便重新开启时使用同一个分享链接
      await note.save({ timestamps: false }); // 不更新updatedAt
    }

    // 记录活动
    void ActivityLogger.record(
      {
        type: share ? "share_enable" : "share_disable",
        target: "note",
        targetId: note.id,
        title: share
          ? `开启手帐分享：${note.title}`
          : `关闭手帐分享：${note.title}`,
        userId,
      },
      { blocking: false },
    );

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
      isDeleted: { $ne: true },
    })
      .select("-content") // 排除 content 字段，减少网络传输
      .sort({ updatedAt: -1 })
      .lean();

    return toLeanNoteArray(notes);
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

    const { noteBookId, title } = await NoteService.resolveRestoreNoteBookId(
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
    const result = await Note.deleteOne({ _id: id, userId, isDeleted: true });
    return Boolean(result.deletedCount);
  }
}
