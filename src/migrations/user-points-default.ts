import User from "@/model/User.js";
import type { SchemaMigration } from "./types";

export const userPointsDefaultMigration: SchemaMigration = {
  name: "user-points-default",
  version: 1,
  async run() {
    const result = await User.updateMany(
      { $or: [{ points: { $exists: false } }, { points: null }] },
      { $set: { points: 200 } },
      { timestamps: false },
    );
    return {
      modified: result.modifiedCount,
      message:
        result.modifiedCount > 0
          ? `补默认积分 200：${result.modifiedCount} 个用户`
          : "无旧数据需补齐",
    };
  },
};
