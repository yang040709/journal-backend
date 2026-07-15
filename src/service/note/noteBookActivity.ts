import NoteBook from "../../model/NoteBook";

/**
 * 手帐内容活动后刷新手帐本最近更新时间（可选同步 count）。
 * 使用 timestamps: false + 显式 $set updatedAt，避免与 count 维护逻辑冲突。
 * @param at 可选显式时间戳（换本等需保证目标本 updatedAt 严格晚于源本时使用）
 */
export async function touchNoteBookAfterNoteActivity(
  noteBookId: string,
  countDelta?: number,
  at?: Date,
): Promise<void> {
  const id = String(noteBookId || "").trim();
  if (!id) return;

  const updatedAt = at ?? new Date();
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
