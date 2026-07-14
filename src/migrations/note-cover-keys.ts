import mongoose from "mongoose";
import Note from "../model/Note.js";
import { normalizeNoteImageObjectKeys } from "../utils/cosKeyOwnership";
import { isCosObjectKey } from "../utils/cosDelete";
import type { SchemaMigration, SchemaMigrationContext } from "./types";

const BATCH_SIZE = 100;

function needsNormalize(
  images: Array<{ key?: string; thumbKey?: string }> | undefined,
): boolean {
  if (!Array.isArray(images) || !images.length) return false;
  return images.some((img) => {
    const key = String(img?.key || "").trim();
    const thumbKey = String(img?.thumbKey || "").trim();
    return (
      (key && !isCosObjectKey(key)) || (thumbKey && !isCosObjectKey(thumbKey))
    );
  });
}

export async function runNoteCoverKeysBackfill(
  ctx: SchemaMigrationContext = {},
) {
  const dryRun = Boolean(ctx.dryRun);
  const userId = String(ctx.userId || "").trim();

  let scanned = 0;
  let dirty = 0;
  let modified = 0;
  let lastId: mongoose.Types.ObjectId | null = null;

  for (;;) {
    const query: Record<string, unknown> = {
      "images.0": { $exists: true },
      ...(lastId ? { _id: { $gt: lastId } } : {}),
      ...(userId ? { userId } : {}),
    };

    const batch = await Note.find(query)
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .select("_id userId images")
      .lean();

    if (batch.length === 0) break;

    const ops: Array<{
      updateOne: {
        filter: { _id: mongoose.Types.ObjectId };
        update: { $set: { images: unknown } };
      };
    }> = [];

    for (const row of batch) {
      scanned += 1;
      if (!needsNormalize(row.images as any)) continue;
      dirty += 1;
      const nextImages = normalizeNoteImageObjectKeys(row.images as any);
      if (!nextImages) continue;
      if (dryRun) continue;
      ops.push({
        updateOne: {
          filter: { _id: row._id as mongoose.Types.ObjectId },
          update: { $set: { images: nextImages } },
        },
      });
    }

    if (ops.length > 0) {
      const result = await Note.bulkWrite(ops as never[], {
        timestamps: false,
      });
      modified += result.modifiedCount;
    }

    lastId = batch[batch.length - 1]._id as mongoose.Types.ObjectId;
  }

  return {
    scanned,
    modified: dryRun ? dirty : modified,
    message: dryRun
      ? `dryRun scanned=${scanned} dirty=${dirty}`
      : `scanned=${scanned} dirty=${dirty} modified=${modified}`,
  };
}

export const noteCoverKeysMigration: SchemaMigration = {
  name: "note-cover-keys",
  version: 1,
  async run(ctx) {
    return runNoteCoverKeysBackfill(ctx);
  },
};
