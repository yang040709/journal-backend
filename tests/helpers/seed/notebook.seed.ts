import NoteBook from "../../../src/model/NoteBook";

export async function seedNoteBook(userId: string, title = "测试手帐本") {
  const doc = await NoteBook.create({
    title,
    userId,
    count: 0,
  });
  return {
    id: doc._id.toString(),
    title: doc.title,
    userId: doc.userId,
  };
}
