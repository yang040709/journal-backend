import Note from "../../../src/model/Note";

export async function seedNote(input: {
  userId: string;
  noteBookId: string;
  title?: string;
  content?: string;
  shareId?: string;
  isShare?: boolean;
}) {
  const doc = await Note.create({
    userId: input.userId,
    noteBookId: input.noteBookId,
    title: input.title ?? "测试手帐",
    content: input.content ?? "测试内容",
    tags: [],
    images: [],
    shareId: input.shareId,
    isShare: input.isShare ?? false,
    shareVersion: input.isShare ? 1 : 0,
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
