import Note from "../model/Note.js";
import type { SchemaMigration } from "./types";

export const shareVersionDefaultMigration: SchemaMigration = {
  name: "share-version-default",
  version: 1,
  async run() {
    const result = await Note.updateMany(
      { shareVersion: { $exists: false } },
      { $set: { shareVersion: 0 } },
      { timestamps: false },
    );
    return {
      modified: result.modifiedCount,
      message:
        result.modifiedCount > 0
          ? `补齐 note.shareVersion：${result.modifiedCount} 条`
          : "无旧数据需补齐",
    };
  },
};
