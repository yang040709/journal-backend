import Note from "../model/Note.js";
import NoteBook from "../model/NoteBook.js";
import type { SchemaMigration } from "./types";

export const softDeleteBackfillMigration: SchemaMigration = {
  name: "soft-delete-backfill",
  version: 1,
  async run() {
    const [noteResult, noteBookResult] = await Promise.all([
      Note.updateMany(
        { isDeleted: { $exists: false } },
        {
          $set: {
            isDeleted: false,
            deletedAt: null,
            deleteExpireAt: null,
          },
        },
        { timestamps: false },
      ),
      NoteBook.updateMany(
        { isDeleted: { $exists: false } },
        {
          $set: {
            isDeleted: false,
            deletedAt: null,
            deleteExpireAt: null,
          },
        },
        { timestamps: false },
      ),
    ]);
    const modified = noteResult.modifiedCount + noteBookResult.modifiedCount;
    return {
      modified,
      message:
        modified > 0
          ? `notes=${noteResult.modifiedCount}, notebooks=${noteBookResult.modifiedCount}`
          : "无旧数据需补齐",
    };
  },
};
