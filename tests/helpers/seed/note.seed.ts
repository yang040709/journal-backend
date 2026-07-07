import Note from "../../../src/model/Note";
import { getTrashExpireAt } from "../../../src/service/note/note.shared";
import { buildNoteContentPreview } from "../../../src/utils/noteContentPreview";

export function fixedUtcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 10, 0, 0, 0));
}

export async function seedNote(input: {
  userId: string;
  noteBookId: string;
  title?: string;
  content?: string;
  shareId?: string;
  isShare?: boolean;
  tags?: string[];
  createdAt?: Date;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  deleteExpireAt?: Date | null;
}) {
  const now = new Date();
  const isDeleted = input.isDeleted ?? false;
  const deletedAt = isDeleted ? (input.deletedAt ?? now) : null;
  const deleteExpireAt = isDeleted
    ? (input.deleteExpireAt ?? getTrashExpireAt(deletedAt ?? now))
    : null;

  const content = input.content ?? "测试内容";

  const doc = await Note.create({
    userId: input.userId,
    noteBookId: input.noteBookId,
    title: input.title ?? "测试手帐",
    content,
    contentPreview: buildNoteContentPreview(content),
    tags: input.tags ?? [],
    images: [],
    shareId: input.shareId,
    isShare: input.isShare ?? false,
    shareVersion: input.isShare ? 1 : 0,
    isDeleted,
    deletedAt,
    deleteExpireAt,
    ...(input.createdAt ? { createdAt: input.createdAt, updatedAt: input.createdAt } : {}),
  });

  return {
    id: doc._id.toString(),
    title: doc.title,
    noteBookId: doc.noteBookId,
    userId: doc.userId,
    shareId: doc.shareId,
    isShare: doc.isShare,
  };
}
