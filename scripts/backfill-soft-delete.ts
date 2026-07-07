import mongoose from "mongoose";
import dotenv from "dotenv";
import Note from "../src/model/Note";
import NoteBook from "../src/model/NoteBook";

dotenv.config();

async function main() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/journal";
  await mongoose.connect(mongoUri);

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
    ),
  ]);

  console.log(
    `[backfill-soft-delete] notes matched=${noteResult.matchedCount} modified=${noteResult.modifiedCount}`,
  );
  console.log(
    `[backfill-soft-delete] notebooks matched=${noteBookResult.matchedCount} modified=${noteBookResult.modifiedCount}`,
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[backfill-soft-delete] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
