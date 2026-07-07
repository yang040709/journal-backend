import NoteBook from "../../../src/model/NoteBook";
import { getTrashExpireAt } from "../../../src/service/note/note.shared";

export async function seedNoteBook(
  userId: string,
  title = "测试手帐本",
  options?: { isDeleted?: boolean },
) {
  const now = new Date();
  const isDeleted = options?.isDeleted ?? false;
  const doc = await NoteBook.create({
    title,
    userId,
    count: 0,
    isDeleted,
    deletedAt: isDeleted ? now : null,
    deleteExpireAt: isDeleted ? getTrashExpireAt(now) : null,
  });
  return {
    id: doc._id.toString(),
    title: doc.title,
    userId: doc.userId,
  };
}
