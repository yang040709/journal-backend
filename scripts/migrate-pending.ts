/**
 * 仅执行未成功的 schema 迁移后退出（便于将来 compose one-shot）
 *
 * Usage:
 *   cd backend
 *   pnpm migrate:pending
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import {
  ensureShareSecurityTaskIndexes,
  runPendingMigrations,
} from "../src/migrations/runner";

dotenv.config();

async function main() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/journal";
  await mongoose.connect(mongoUri);
  await runPendingMigrations();
  await ensureShareSecurityTaskIndexes();
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[migrate:pending] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
