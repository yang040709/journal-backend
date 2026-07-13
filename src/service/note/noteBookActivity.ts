import NoteBook from "../../model/NoteBook";

/**
 * 手帐内容活动后刷新手帐本最近更新时间（可选同步 count）。
 * 使用 timestamps: false + 显式 $set updatedAt，避免与 count 维护逻辑冲突。
 */
export async function touchNoteBookAfterNoteActivity(
  noteBookId: string,
  countDelta?: number,
): Promise<void> {
  const id = String(noteBookId || "").trim();
  if (!id) return;

  const updatedAt = new Date();
  if (countDelta === undefined) {
    await NoteBook.updateOne(
      { _id: id },
      { $set: { updatedAt } },
      { timestamps: false },
    );
    return;
  }

  await NoteBook.updateOne(
    { _id: id },
    { $inc: { count: countDelta }, $set: { updatedAt } },
    { timestamps: false },
  );
}
