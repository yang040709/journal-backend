import Note, { INote, INoteImage } from "../model/Note";
import NoteBook from "../model/NoteBook";
import { nanoid } from "nanoid";
import { toLeanNote, toLeanNoteArray } from "../utils/typeUtils";
import { LeanNote } from "../types/mongoose";
import { PaginationParams } from "./note.service";
import { checkNoteContent } from "../utils/sensitive-encrypted";
import { ActivityLogger } from "../utils/ActivityLogger";

export const ADMIN_SHARE_NOTE_PATH_PREFIX =
  "/share/pages/share-note/share-note?share_id=";

export interface AdminCreateNoteData {
  noteBookId: string;
  title: string;
  content: string;
  tags?: string[];
  images?: INoteImage[];
  userId: string;
  appliedSystemTemplateKey?: string;
}

export interface AdminUpdateNoteData {
  title?: string;
  content?: string;
  tags?: string[];
  noteBookId?: string;
  images?: INoteImage[];
}

export type AdminNoteListItem = LeanNote & { sharePath?: string };

export interface AdminNoteListParams extends PaginationParams {
  userId?: string;
  /** 不传则不限；true/false 筛选是否已开启分享 */
  isShare?: boolean;
  /** 标题/正文 $text 检索；与 tags 同时存在时忽略 tags */
  q?: string;
}

/** 构建手帐管理列表查询条件（手帐列表与分享列表共用） */
export function buildAdminNoteListQuery(
  params: Pick<
    AdminNoteListParams,
    "userId" | "noteBookId" | "tags" | "startTime" | "endTime" | "isShare"
  >,
): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  if (params.userId) {
    query.userId = params.userId;
  }
  if (params.noteBookId) {
    query.noteBookId = params.noteBookId;
  }
  if (params.tags && params.tags.length > 0) {
    query.tags = { $all: params.tags };
  }
  if (params.startTime || params.endTime) {
    const createdAt: Record<string, Date> = {};
    if (params.startTime) {
      createdAt.$gte = new Date(params.startTime);
    }
    if (params.endTime) {
      const endOfRange = new Date(params.endTime);
      endOfRange.setDate(endOfRange.getDate() + 1);
      createdAt.$lt = endOfRange;
    }
    query.createdAt = createdAt;
  }
  if (params.isShare === true || params.isShare === false) {
    query.isShare = params.isShare;
  }
  return query;
}

function enrichNoteWithSharePath<T extends LeanNote>(note: T): AdminNoteListItem {
  if (note.isShare && note.shareId) {
    return {
      ...note,
      sharePath: `${ADMIN_SHARE_NOTE_PATH_PREFIX}${note.shareId}`,
    };
  }
  return { ...note };
}

export class AdminNoteService {
  static async listNotes(
    params: AdminNoteListParams = {},
  ): Promise<{ items: AdminNoteListItem[]; total: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;
    const sortField = params.sortBy || "updatedAt";
    const sortOrder = params.order === "asc" ? 1 : -1;

    const textQ = params.q?.trim();
    const queryParams: AdminNoteListParams = textQ
      ? { ...params, tags: undefined }
      : params;
    const query: Record<string, unknown> = {
      ...buildAdminNoteListQuery(queryParams),
    };
    if (textQ) {
      query.$text = { $search: textQ };
    }

    const [items, total] = await Promise.all([
      Note.find(query)
        .select("-content")
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Note.countDocuments(query),
    ]);
    const lean = toLeanNoteArray(items);
    return {
      items: lean.map(enrichNoteWithSharePath),
      total,
    };
  }

  static async getNoteById(id: string): Promise<AdminNoteListItem | null> {
    const note = await Note.findById(id).lean();
    if (!note) {
      return null;
    }
    return enrichNoteWithSharePath(toLeanNote(note));
  }

  static async createNote(data: AdminCreateNoteData): Promise<INote> {
    const noteBook = await NoteBook.findOne({
      _id: data.noteBookId,
      userId: data.userId,
    });
    if (!noteBook) {
      throw new Error("手帐本不存在或与所属用户不匹配");
    }

    const key = data.appliedSystemTemplateKey?.trim();
    const note = new Note({
      noteBookId: data.noteBookId,
      title: data.title,
      content: data.content,
      tags: data.tags || [],
      images: data.images || [],
      userId: data.userId,
      isShare: false,
      shareId: nanoid(12),
      ...(key ? { appliedSystemTemplateKey: key.slice(0, 120) } : {}),
    });
    await note.save();
    await NoteBook.updateOne({ _id: data.noteBookId }, { $inc: { count: 1 } });
    return note;
  }

  static async updateNote(
    id: string,
    data: AdminUpdateNoteData,
  ): Promise<INote | null> {
    const note = await Note.findById(id);
    if (!note) {
      return null;
    }

    if (data.noteBookId && data.noteBookId !== note.noteBookId) {
      const newNb = await NoteBook.findOne({
        _id: data.noteBookId,
        userId: note.userId,
      });
      if (!newNb) {
        throw new Error("目标手帐本不存在或无权访问");
      }
      await Promise.all([
        NoteBook.updateOne({ _id: note.noteBookId }, { $inc: { count: -1 } }),
        NoteBook.updateOne({ _id: data.noteBookId }, { $inc: { count: 1 } }),
      ]);
      note.noteBookId = data.noteBookId;
    }

    if (data.title !== undefined) note.title = data.title;
    if (data.content !== undefined) note.content = data.content;
    if (data.tags !== undefined) note.tags = data.tags;
    if (data.images !== undefined) note.images = data.images;

    await note.save();
    return note;
  }

  static async deleteNote(id: string): Promise<boolean> {
    const note = await Note.findById(id);
    if (!note) {
      return false;
    }
    await Note.deleteOne({ _id: id });
    await NoteBook.updateOne({ _id: note.noteBookId }, { $inc: { count: -1 } });
    return true;
  }

  /** 管理端批量设置分享（与 C 端 setNoteShareStatus 行为一致，不按 userId 校验） */
  static async adminSetShareStatus(noteId: string, share: boolean): Promise<boolean> {
    const note = await Note.findById(noteId);
    if (!note) {
      return false;
    }
    if (!note.shareId) {
      note.shareId = nanoid(12);
    }
    if (share) {
      const checkResult = checkNoteContent(note.title, note.content);
      if (checkResult.hasAnySensitive) {
        note.title = checkResult.processedTitle;
        note.content = checkResult.processedContent;
      }
      note.isShare = true;
      if (!note.firstSharedAt) {
        note.firstSharedAt = new Date();
      }
    } else {
      note.isShare = false;
    }
    await note.save({ timestamps: false });
    void ActivityLogger.record(
      {
        type: share ? "share_enable" : "share_disable",
        target: "note",
        targetId: String(note._id),
        title: share
          ? `开启手帐分享：${note.title}`
          : `关闭手帐分享：${note.title}`,
        userId: note.userId,
      },
      { blocking: false },
    );
    return true;
  }

  static async batchSetShare(
    noteIds: string[],
    share: boolean,
  ): Promise<{ ok: number; missing: string[] }> {
    const ids = noteIds.slice(0, 50);
    const missing: string[] = [];
    let ok = 0;
    for (const id of ids) {
      const done = await AdminNoteService.adminSetShareStatus(id, share);
      if (done) {
        ok += 1;
      } else {
        missing.push(id);
      }
    }
    return { ok, missing };
  }

  static async batchSetTags(
    noteIds: string[],
    tags: string[],
    mode: "replace" | "add",
  ): Promise<{ ok: number; missing: string[] }> {
    const ids = noteIds.slice(0, 50);
    const missing: string[] = [];
    let ok = 0;
    for (const id of ids) {
      const note = await Note.findById(id);
      if (!note) {
        missing.push(id);
        continue;
      }
      if (mode === "replace") {
        note.tags = tags;
      } else {
        const merged = [...(note.tags || []), ...tags];
        note.tags = [
          ...new Set(
            merged.map((t) => String(t).trim()).filter(Boolean),
          ),
        ];
      }
      await note.save();
      ok += 1;
    }
    return { ok, missing };
  }
}
