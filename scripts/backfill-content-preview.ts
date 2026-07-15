/**
 * 补齐 notes.contentPreview（幂等）
 *
 * Usage:
 *   cd backend
 *   pnpm backfill:content-preview
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { runPendingMigrations } from "../src/migrations/runner";

dotenv.config();

async function main() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/journal";
  await mongoose.connect(mongoUri);
  await runPendingMigrations({ forceName: "content-preview" });
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[backfill-content-preview] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
