/**
 * 数据库迁移脚本：为Note模型添加分享相关字段
 * 执行命令：node -r ts-node/register src/migrations/add-share-fields.ts
 */

import dotenv from "dotenv";
import { connectDB } from "../config/db.js";
import Note from "../model/Note.js";

dotenv.config();

async function migrate() {
  console.log("🚀 开始数据库迁移：添加 isShare 字段（shareId 保持未定义）...");

  try {
    await connectDB();
    console.log("✅ 数据库连接成功");

    db.notes.updateMany(
      { shareId: { $exists: true } },
      { $unset: { shareId: "" } },
    );

    // // 只更新那些没有 isShare 字段的文档
    // const result = await Note.updateMany(
    //   { isShare: { $exists: false } },
    //   { $set: { isShare: false } },
    // );

    // console.log(`✅ 迁移完成！成功更新 ${result.modifiedCount} 条记录`);
    // console.log("📋 说明：");
    // console.log(`   - 所有旧笔记已设置 isShare: false`);
    // console.log(
    //   `   - shareId 字段未被设置（保持缺失状态），符合 sparse 索引要求`,
    // );

    // // 验证
    // const sample = await Note.findOne({});
    // if (sample) {
    //   console.log("🔍 样本数据：", {
    //     isShare: sample.isShare,
    //     hasShareId: "shareId" in sample,
    //     shareId: sample.shareId,
    //   });
    // }

    process.exit(0);
  } catch (error) {
    console.error("❌ 迁移失败:", error);
    process.exit(1);
  }
}

migrate();
