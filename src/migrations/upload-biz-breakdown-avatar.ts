import UserUploadQuotaDaily from "../model/UserUploadQuotaDaily.js";
import type { SchemaMigration } from "./types";

export const uploadBizBreakdownAvatarMigration: SchemaMigration = {
  name: "upload-biz-breakdown-avatar",
  version: 1,
  async run() {
    const result = await UserUploadQuotaDaily.updateMany(
      { "bizBreakdown.avatar": { $exists: false } },
      { $set: { "bizBreakdown.avatar": 0 } },
      { timestamps: false },
    );
    return {
      modified: result.modifiedCount,
      message:
        result.modifiedCount > 0
          ? `补齐 bizBreakdown.avatar：${result.modifiedCount} 条`
          : "bizBreakdown.avatar 已完整",
    };
  },
};
