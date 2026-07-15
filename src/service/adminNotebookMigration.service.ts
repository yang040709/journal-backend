import { nanoid } from "nanoid";
import { z } from "zod";
import Note, { INoteImage } from "../model/Note";
import NoteBook from "../model/NoteBook";
import User from "../model/User";
import UserImageAsset from "../model/UserImageAsset";
import { optionalNoteImagesSchema } from "../schemas/noteImage.schema";
import { ActivityLogger } from "../utils/ActivityLogger";
import { MAX_PINNED_PER_NOTEBOOK } from "./note.service";
import { MediaReferenceService } from "./mediaReference.service";
import { recordFromNoteImages } from "./userImageAsset.service";

export const NOTEBOOK_MIGRATION_VERSION = "1.0.0";
export const NOTEBOOK_MIGRATION_TYPE = "notebook_migration";
const IMPORT_MAX_NOTES = 5000;
const IMPORT_MAX_TEXT_LENGTH = 50_000;
const NOTEBOOK_TITLE_MAX = 100;
const NOTE_TITLE_MAX = 200;
const NOTE_TAG_MAX_LENGTH = 20;
const NOTE_TAG_MAX_COUNT = 100;

export interface NotebookMigrationImage {
  url: string;
  key: string;
  thumbUrl?: string;
  thumbKey?: string;
  width: number;
  height: number;
  size: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  createdAt?: string;
}

export interface NotebookMigrationNote {
  title: string;
  content: string;
  tags: string[];
  images: NotebookMigrationImage[];
  isFavorite: boolean;
  favoritedAt: string | null;
  isPinned: boolean;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotebookMigrationEnvelope {
  version: string;
  type: string;
  exportTime: string;
  appName: string;
  notebook: {
    title: string;
    coverImg: string;
  };
  notes: NotebookMigrationNote[];
  statistics: {
    noteCount: number;
  };
}

export interface NotebookMigrationExportResult {
  envelope: NotebookMigrationEnvelope;
  fileName: string;
}

export interface NotebookMigrationImportOptions {
  titleOverride?: string;
}

export interface NotebookMigrationImportResult {
  notebookId: string;
  title: string;
  importedNotes: number;
  skippedNotes: number;
  warnings: string[];
}

function parseOptionalDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseRequiredDate(value: unknown, fallback: Date): Date {
  const d = parseOptionalDate(value);
  return d ?? fallback;
}

function mapNoteImage(img: INoteImage): NotebookMigrationImage {
  const out: NotebookMigrationImage = {
    url: img.url,
    key: img.key,
    width: img.width ?? 0,
    height: img.height ?? 0,
    size: img.size ?? 0,
    mimeType: img.mimeType,
  };
  if (img.thumbUrl) out.thumbUrl = img.thumbUrl;
  if (img.thumbKey) out.thumbKey = img.thumbKey;
  if (img.createdAt) {
    out.createdAt =
      img.createdAt instanceof Date
        ? img.createdAt.toISOString()
        : String(img.createdAt);
  }
  return out;
}

function sanitizeTags(tags: unknown): string[] {
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

function parseNoteImages(imagesRaw: unknown, noteIndex: number) {
  try {
    return optionalNoteImagesSchema.parse(imagesRaw ?? []) ?? [];
  } catch (e) {
    if (e instanceof z.ZodError) {
      const detail = e.issues.map((item) => item.message).join("；");
      throw new Error(`第 ${noteIndex + 1} 条手帐图片校验失败：${detail}`);
    }
    throw e;
  }
}

async function rollbackImport(
  userId: string,
  noteBookId: string,
  createdNoteIds: string[],
): Promise<void> {
  for (const noteId of createdNoteIds) {
    await MediaReferenceService.releaseNoteRefs(userId, noteId);
  }
  if (createdNoteIds.length) {
    await UserImageAsset.deleteMany({
      userId,
      source: "note",
      refId: { $in: createdNoteIds },
    });
    await Note.deleteMany({ _id: { $in: createdNoteIds } });
  }
  await NoteBook.deleteOne({ _id: noteBookId });
}

function sanitizeTitleForFileName(title: string): string {
  const trimmed = String(title || "notebook").trim().slice(0, 40);
  return trimmed.replace(/[\\/:*?"<>|]/g, "_") || "notebook";
}

function validateEnvelope(data: unknown): NotebookMigrationEnvelope {
  if (!data || typeof data !== "object") {
    throw new Error("导入数据格式错误");
  }
  const raw = data as Record<string, unknown>;
  if (raw.type !== NOTEBOOK_MIGRATION_TYPE) {
    throw new Error(`仅支持 type=${NOTEBOOK_MIGRATION_TYPE} 的迁移文件`);
  }
  if (raw.version !== NOTEBOOK_MIGRATION_VERSION) {
    throw new Error(`仅支持 version=${NOTEBOOK_MIGRATION_VERSION} 的迁移文件`);
  }
  const notebook = raw.notebook as Record<string, unknown> | undefined;
  if (!notebook || typeof notebook.title !== "string" || !notebook.title.trim()) {
    throw new Error("导入数据缺少有效的 notebook.title");
  }
  if (!Array.isArray(raw.notes)) {
    throw new Error("导入数据 notes 必须是数组");
  }
  if (raw.notes.length > IMPORT_MAX_NOTES) {
    throw new Error(`导入手帐数量不能超过 ${IMPORT_MAX_NOTES}`);
  }

  const notebookTitle = String(notebook.title).trim();
  if (notebookTitle.length > NOTEBOOK_TITLE_MAX) {
    throw new Error(`手帐本标题不能超过 ${NOTEBOOK_TITLE_MAX} 个字符`);
  }

  const notes: NotebookMigrationNote[] = [];
  raw.notes.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`第 ${index + 1} 条手帐格式错误`);
    }
    const note = item as Record<string, unknown>;
    const title = String(note.title ?? "").trim();
    if (!title) {
      throw new Error(`第 ${index + 1} 条手帐缺少 title`);
    }
    if (title.length > NOTE_TITLE_MAX) {
      throw new Error(`第 ${index + 1} 条手帐 title 超过 ${NOTE_TITLE_MAX} 个字符`);
    }
    const content = String(note.content ?? "");
    if (content.length > IMPORT_MAX_TEXT_LENGTH) {
      throw new Error(`第 ${index + 1} 条手帐 content 超过长度上限`);
    }
    const parsedImages = parseNoteImages(note.images, index);
    const tags = sanitizeTags(note.tags);
    const nowIso = new Date().toISOString();
    notes.push({
      title,
      content,
      tags,
      images: (parsedImages ?? []).map((img) => ({
        url: img.url,
        key: img.key,
        thumbUrl: img.thumbUrl,
        thumbKey: img.thumbKey,
        width: img.width,
        height: img.height,
        size: img.size,
        mimeType: img.mimeType,
        createdAt: img.createdAt
          ? img.createdAt instanceof Date
            ? img.createdAt.toISOString()
            : String(img.createdAt)
          : undefined,
      })),
      isFavorite: Boolean(note.isFavorite),
      favoritedAt: note.favoritedAt
        ? parseOptionalDate(note.favoritedAt)?.toISOString() ?? null
        : null,
      isPinned: Boolean(note.isPinned),
      pinnedAt: note.pinnedAt
        ? parseOptionalDate(note.pinnedAt)?.toISOString() ?? null
        : null,
      createdAt: parseRequiredDate(note.createdAt, new Date(nowIso)).toISOString(),
      updatedAt: parseRequiredDate(note.updatedAt, new Date(nowIso)).toISOString(),
    });
  });

  return {
    version: NOTEBOOK_MIGRATION_VERSION,
    type: NOTEBOOK_MIGRATION_TYPE,
    exportTime: String(raw.exportTime || new Date().toISOString()),
    appName: String(raw.appName || "手帐"),
    notebook: {
      title: notebookTitle,
      coverImg: String(notebook.coverImg ?? ""),
    },
    notes,
    statistics: {
      noteCount: notes.length,
    },
  };
}

function applyPinLimit(notes: NotebookMigrationNote[]): {
  notes: NotebookMigrationNote[];
  warnings: string[];
} {
  const pinnedIndices = notes
    .map((n, i) => ({ i, pinnedAt: n.isPinned ? parseOptionalDate(n.pinnedAt) : null }))
    .filter((x) => notes[x.i].isPinned)
    .sort((a, b) => {
      const ta = a.pinnedAt?.getTime() ?? 0;
      const tb = b.pinnedAt?.getTime() ?? 0;
      return tb - ta;
    });

  if (pinnedIndices.length <= MAX_PINNED_PER_NOTEBOOK) {
    return { notes, warnings: [] };
  }

  const keep = new Set(
    pinnedIndices.slice(0, MAX_PINNED_PER_NOTEBOOK).map((x) => x.i),
  );
  const next = notes.map((n, i) => {
    if (!n.isPinned || keep.has(i)) return n;
    return { ...n, isPinned: false, pinnedAt: null };
  });
  const dropped = pinnedIndices.length - MAX_PINNED_PER_NOTEBOOK;
  return {
    notes: next,
    warnings: [
      `置顶手帐超过 ${MAX_PINNED_PER_NOTEBOOK} 条，已保留 ${MAX_PINNED_PER_NOTEBOOK} 条，其余 ${dropped} 条改为未置顶`,
    ],
  };
}

export class AdminNotebookMigrationService {
  static async exportNotebook(
    noteBookId: string,
  ): Promise<NotebookMigrationExportResult> {
    const noteBook = await NoteBook.findById(noteBookId).lean();
    if (!noteBook) {
      throw new Error("手帐本不存在");
    }
    if (noteBook.isDeleted) {
      throw new Error("手帐本已删除，无法导出");
    }

    const notes = await Note.find({
      noteBookId: String(noteBook._id),
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: 1 })
      .lean();

    const mappedNotes: NotebookMigrationNote[] = notes.map((note) => ({
      title: note.title,
      content: note.content ?? "",
      tags: note.tags ?? [],
      images: (note.images ?? []).map((img) => mapNoteImage(img as INoteImage)),
      isFavorite: Boolean(note.isFavorite),
      favoritedAt: note.favoritedAt
        ? new Date(note.favoritedAt).toISOString()
        : null,
      isPinned: Boolean(note.isPinned),
      pinnedAt: note.pinnedAt ? new Date(note.pinnedAt).toISOString() : null,
      createdAt: note.createdAt
        ? new Date(note.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: note.updatedAt
        ? new Date(note.updatedAt).toISOString()
        : new Date().toISOString(),
    }));

    const envelope: NotebookMigrationEnvelope = {
      version: NOTEBOOK_MIGRATION_VERSION,
      type: NOTEBOOK_MIGRATION_TYPE,
      exportTime: new Date().toISOString(),
      appName: "手帐",
      notebook: {
        title: noteBook.title,
        coverImg: noteBook.coverImg || "",
      },
      notes: mappedNotes,
      statistics: {
        noteCount: mappedNotes.length,
      },
    };

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .split(".")[0];
    const fileName = `手帐本_${sanitizeTitleForFileName(noteBook.title)}_${timestamp}.json`;

    void ActivityLogger.record(
      {
        type: "create",
        target: "noteBook",
        targetId: noteBookId,
        title: `管理端导出手帐本 JSON：${noteBook.title}（${mappedNotes.length} 条手帐）`,
        userId: noteBook.userId,
      },
      { blocking: false },
    );

    return { envelope, fileName };
  }

  static async importNotebook(
    userId: string,
    rawData: unknown,
    options: NotebookMigrationImportOptions = {},
  ): Promise<NotebookMigrationImportResult> {
    const trimmedUserId = String(userId || "").trim();
    if (!trimmedUserId) {
      throw new Error("userId 不能为空");
    }

    const user = await User.findOne({ userId: trimmedUserId }).select("userId").lean();
    if (!user) {
      throw new Error("目标用户不存在");
    }

    const envelope = validateEnvelope(rawData);
    const titleOverride = String(options.titleOverride ?? "").trim();
    const notebookTitle = titleOverride || envelope.notebook.title;
    if (notebookTitle.length > NOTEBOOK_TITLE_MAX) {
      throw new Error(`手帐本标题不能超过 ${NOTEBOOK_TITLE_MAX} 个字符`);
    }

    const { notes: notesToImport, warnings } = applyPinLimit(envelope.notes);

    let noteBookId: string | null = null;
    const createdNoteIds: string[] = [];

    try {
      const noteBook = new NoteBook({
        title: notebookTitle,
        coverImg: envelope.notebook.coverImg || "",
        count: 0,
        userId: trimmedUserId,
      });
      await noteBook.save();
      noteBookId = String(noteBook._id);

      for (const noteData of notesToImport) {
        const createdAt = parseRequiredDate(noteData.createdAt, new Date());
        const updatedAt = parseRequiredDate(noteData.updatedAt, createdAt);
        const favoritedAt = noteData.isFavorite
          ? parseOptionalDate(noteData.favoritedAt) ?? createdAt
          : null;
        const pinnedAt = noteData.isPinned
          ? parseOptionalDate(noteData.pinnedAt) ?? createdAt
          : null;

        const images = (noteData.images ?? []).map((img) => ({
          url: img.url,
          key: img.key,
          thumbUrl: img.thumbUrl,
          thumbKey: img.thumbKey,
          width: img.width,
          height: img.height,
          size: img.size,
          mimeType: img.mimeType,
          createdAt: img.createdAt ? parseOptionalDate(img.createdAt) ?? undefined : undefined,
        }));

        const note = new Note({
          noteBookId,
          title: noteData.title,
          content: noteData.content ?? "",
          tags: noteData.tags ?? [],
          images,
          userId: trimmedUserId,
          isShare: false,
          shareId: nanoid(12),
          shareVersion: 0,
          isDeleted: false,
          deletedAt: null,
          deleteExpireAt: null,
          isFavorite: noteData.isFavorite,
          favoritedAt,
          isPinned: noteData.isPinned,
          pinnedAt,
          createdAt,
          updatedAt,
        });
        await note.save();
        const noteId = String(note._id);
        createdNoteIds.push(noteId);

        recordFromNoteImages(trimmedUserId, noteId, images);
        await MediaReferenceService.syncNoteImages(trimmedUserId, noteId, images);
      }

      await NoteBook.updateOne(
        { _id: noteBookId },
        { $set: { count: notesToImport.length } },
        { timestamps: false },
      );

      void ActivityLogger.record(
        {
          type: "create",
          target: "noteBook",
          targetId: noteBookId,
          title: `管理端导入手帐本 JSON：${notebookTitle}（${notesToImport.length} 条手帐）`,
          userId: trimmedUserId,
        },
        { blocking: false },
      );

      return {
        notebookId: noteBookId,
        title: notebookTitle,
        importedNotes: notesToImport.length,
        skippedNotes: 0,
        warnings,
      };
    } catch (err) {
      if (noteBookId) {
        await rollbackImport(trimmedUserId, noteBookId, createdNoteIds);
      }
      throw err instanceof Error ? err : new Error("导入失败");
    }
  }
}
