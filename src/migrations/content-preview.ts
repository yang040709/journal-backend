import mongoose from "mongoose";
import Note from "../model/Note.js";
import { buildNoteContentPreview } from "../utils/noteContentPreview";
import type { SchemaMigration } from "./types";

const BATCH_SIZE = 200;

export const contentPreviewMigration: SchemaMigration = {
  name: "content-preview",
  version: 1,
  async run() {
    let scanned = 0;
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
        const result = await Note.bulkWrite(ops as never[], {
          timestamps: false,
        });
        modified += result.modifiedCount;
      }

      scanned += batch.length;
      lastId = batch[batch.length - 1]._id as mongoose.Types.ObjectId;
    }

    return {
      scanned,
      modified,
      message: `processed=${scanned} modified=${modified}`,
    };
  },
};
