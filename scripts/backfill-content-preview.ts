import mongoose from "mongoose";
import dotenv from "dotenv";
import Note from "../src/model/Note";
import { buildNoteContentPreview } from "../src/utils/noteContentPreview";

dotenv.config();

const BATCH_SIZE = 200;

async function main() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/journal";
  await mongoose.connect(mongoUri);

  let processed = 0;
  let modified = 0;
  let lastId: mongoose.Types.ObjectId | null = null;

  for (;;) {
    const query: Record<string, unknown> = lastId
      ? { _id: { $gt: lastId } }
      : {};
    const batch = await Note.find(query)
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .select("_id content contentPreview")
      .lean();

    if (batch.length === 0) break;

    const ops = batch
      .map((row) => {
        const preview = buildNoteContentPreview(String(row.content ?? ""));
        const current = String(row.contentPreview ?? "");
        if (preview === current) return null;
        return {
          updateOne: {
            filter: { _id: row._id },
            update: { $set: { contentPreview: preview } },
          },
        };
      })
      .filter(Boolean);

    if (ops.length > 0) {
      const result = await Note.bulkWrite(ops as never[]);
      modified += result.modifiedCount;
    }

    processed += batch.length;
    lastId = batch[batch.length - 1]._id as mongoose.Types.ObjectId;
    console.log(
      `[backfill-content-preview] processed=${processed} modified=${modified}`,
    );
  }

  console.log(
    `[backfill-content-preview] done processed=${processed} modified=${modified}`,
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[backfill-content-preview] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
