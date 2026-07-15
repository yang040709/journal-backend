/**
 * 存量手帐配图：将 images.key / thumbKey 中的 cover: 伪 key
 * 按 url / thumbUrl 还原为真实 COS object key。
 *
 * Usage:
 *   cd backend
 *   pnpm backfill:note-cover-keys
 *   pnpm backfill:note-cover-keys -- --dry-run
 *   pnpm backfill:note-cover-keys -- --userId=olxxx
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { runPendingMigrations } from "../src/migrations/runner";

dotenv.config();

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const userArg = argv.find((a) => a.startsWith("--userId="));
  const userId = userArg ? userArg.slice("--userId=".length).trim() : "";
  return { dryRun, userId };
}

async function main() {
  const { dryRun, userId } = parseArgs(process.argv.slice(2));
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/journal";
  await mongoose.connect(mongoUri);

  console.log(
    `[backfill-note-cover-keys] start dryRun=${dryRun}${userId ? ` userId=${userId}` : ""}`,
  );

  await runPendingMigrations({
    forceName: "note-cover-keys",
    dryRun,
    userId: userId || undefined,
  });

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[backfill-note-cover-keys] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
