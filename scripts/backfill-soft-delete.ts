/**
 * 软删除字段补齐（幂等，与启动迁移 soft-delete-backfill 同一模块）
 *
 * Usage:
 *   cd backend
 *   pnpm backfill:soft-delete
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { runPendingMigrations } from "../src/migrations/runner";

dotenv.config();

async function main() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/journal";
  await mongoose.connect(mongoUri);
  await runPendingMigrations({ forceName: "soft-delete-backfill" });
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[backfill-soft-delete] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
