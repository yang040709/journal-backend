/**
 * 数据库迁移工具
 */

import Note from "../model/Note.js";
import NoteBook from "../model/NoteBook.js";
import User from "@/model/User.js";
import { coverPreviewList } from "@/constant/img.js";

/**
 * 检查并执行数据库迁移
 */
export async function runMigrations() {
  console.log("🔧 检查数据库迁移...");
  await migrateUserPointsDefault();
}

/**
 * 软删除兼容迁移：
 * 给历史数据补齐 isDeleted / deletedAt / deleteExpireAt，保证旧版本数据可见。
 */
export async function migrateSoftDeleteBackfill() {
  try {
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

    if (noteResult.modifiedCount > 0 || noteBookResult.modifiedCount > 0) {
      console.log(
        `✅ 软删除兼容迁移完成：notes=${noteResult.modifiedCount}, notebooks=${noteBookResult.modifiedCount}`,
      );
    } else {
      console.log("✅ 软删除兼容迁移检查通过：无旧数据需补齐");
    }
  } catch (e) {
    console.error("❌ 软删除兼容迁移失败:", e);
  }
}

async function migrateShare() {
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
        { timestamps: false }, // ⭐ 关键：阻止 updatedAt 自动更新
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
      console.log(`   - 样本 updatedAt: ${sampleNote.updatedAt}`); // 验证时间未变
    }
  } catch (error) {
    console.error("❌ 数据库迁移失败:", error);
    // 不抛出错误，避免影响应用启动
  }
}

async function migrateUsers() {
  const result = await User.updateMany(
    { quickCovers: { $exists: false } }, // 只找没有这个字段的文档
    {
      $set: {
        quickCovers: coverPreviewList.slice(0, 11),
        quickCoversUpdatedAt: new Date(),
      },
    },
    { timestamps: false }, // 阻止 updatedAt 自动更新
  );
  console.log(`更新了 ${result.modifiedCount} 个旧用户数据`);
}

/** 积分功能：老用户补默认 200 分（无 points 字段或为空） */
async function migrateUserPointsDefault() {
  try {
    const result = await User.updateMany(
      { $or: [{ points: { $exists: false } }, { points: null }] },
      { $set: { points: 200 } },
      { timestamps: false },
    );
    if (result.modifiedCount > 0) {
      console.log(`✅ 积分迁移：为 ${result.modifiedCount} 个用户补默认积分 200`);
    }
  } catch (e) {
    console.error("❌ 积分字段迁移失败:", e);
  }
}
