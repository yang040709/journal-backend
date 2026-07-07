import type { FlattenMaps } from "mongoose";
import Note, { LeanNote } from "../model/Note";
import { buildNoteContentPreview } from "./noteContentPreview";
import { toLeanNote } from "./typeUtils";
import { logger } from "./logger";

type NoteListSource = FlattenMaps<Record<string, unknown>>;

function resolveContentPreview(doc: NoteListSource): string {
  const content = String(doc.content ?? "");
  if (content.trim()) {
    return buildNoteContentPreview(content);
  }

  return String(doc.contentPreview ?? "").trim();
}

/**
 * 列表项：保证有 contentPreview，且绝不向客户端透出完整 content。
 */
export function toLeanNoteListItem(doc: NoteListSource): LeanNote {
  const preview = resolveContentPreview(doc);
  const { content: _content, ...rest } = doc;
  return toLeanNote({ ...rest, contentPreview: preview });
}

export function toLeanNoteListItems(docs: NoteListSource[]): LeanNote[] {
  return docs.map(toLeanNoteListItem);
}

/** 对缺 preview 的存量数据异步写回，避免每次列表都读完整 content。 */
export function queueContentPreviewBackfill(docs: NoteListSource[]): void {
  const ops = docs
    .map((doc) => {
      const preview = resolveContentPreview(doc);
      const current = String(doc.contentPreview ?? "").trim();
      if (!preview || preview === current || !doc._id) return null;
      return {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { contentPreview: preview } },
        },
      };
    })
    .filter(Boolean);

  if (ops.length === 0) return;

  void Note.bulkWrite(ops as never[]).catch((err) => {
    logger.warn("contentPreview lazy backfill failed", { err });
  });
}
