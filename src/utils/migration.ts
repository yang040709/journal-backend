/**
 * 数据库迁移工具
 */

import Note from "../model/Note.js";

/**
 * 检查并执行数据库迁移
 */
export async function runMigrations() {
  console.log("🔧 检查数据库迁移...");

  try {
    // 检查是否有需要迁移的文档
    const notesWithoutShareFields = await Note.find({
      $or: [{ isShare: { $exists: false } }, { shareId: { $exists: false } }],
    }).limit(1);

    if (notesWithoutShareFields.length > 0) {
      console.log("📋 发现需要迁移的文档，开始添加分享字段...");

      // 批量更新所有文档
      const result = await Note.updateMany(
        {
          $or: [
            { isShare: { $exists: false } },
            { shareId: { $exists: false } },
          ],
        },
        {
          $set: {
            isShare: false,
            shareId: null,
          },
        },
      );

      console.log(`✅ 迁移完成！更新了 ${result.modifiedCount} 条记录`);
    } else {
      console.log("✅ 数据库已是最新版本，无需迁移");
    }

    // 验证迁移结果
    const sampleNote = await Note.findOne({});
    if (sampleNote) {
      console.log("🔍 数据库状态验证：");
      console.log(`   - 总记录数: ${await Note.countDocuments()}`);
      console.log(`   - 样本 isShare: ${sampleNote.isShare}`);
      console.log(`   - 样本 shareId: ${sampleNote.shareId}`);
    }
  } catch (error) {
    console.error("❌ 数据库迁移失败:", error);
    // 不抛出错误，避免影响应用启动
  }
}
