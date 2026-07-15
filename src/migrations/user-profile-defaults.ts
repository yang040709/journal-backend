import User from "@/model/User.js";
import type { SchemaMigration } from "./types";

export const userProfileDefaultsMigration: SchemaMigration = {
  name: "user-profile-defaults",
  version: 1,
  async run() {
    const result = await User.updateMany(
      {
        $or: [
          { nickname: { $exists: false } },
          { avatarUrl: { $exists: false } },
          { bio: { $exists: false } },
          { membershipText: { $exists: false } },
        ],
      },
      {
        $set: {
          nickname: "",
          avatarUrl: "",
          bio: "手帐记录生活点滴",
          membershipText: "",
        },
      },
      { timestamps: false },
    );
    return {
      modified: result.modifiedCount,
      message:
        result.modifiedCount > 0
          ? `补齐资料字段：${result.modifiedCount} 个用户`
          : "无旧数据需补齐",
    };
  },
};
