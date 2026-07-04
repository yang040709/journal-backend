import PendingCosDelete, {
  type PendingCosDeleteStatus,
} from "../model/PendingCosDelete";
import { deleteCosObjects, isCosObjectKey } from "../utils/cosDelete";
import { logger } from "../utils/logger";

const DEFAULT_MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 60_000;

export interface EnqueueCosDeletesOptions {
  userId?: string;
  source?: string;
}

export async function enqueueCosDeletes(
  keys: string[],
  options: EnqueueCosDeletesOptions = {},
): Promise<number> {
  const unique = [
    ...new Set(
      keys.map((k) => String(k || "").trim()).filter((k) => isCosObjectKey(k)),
    ),
  ];
  if (!unique.length) return 0;

  const ops = unique.map((cosKey) => ({
    updateOne: {
      filter: { cosKey },
      update: {
        $set: {
          cosKey,
          userId: options.userId,
          source: options.source || "unknown",
          status: "pending" as PendingCosDeleteStatus,
          attempts: 0,
          maxAttempts: DEFAULT_MAX_ATTEMPTS,
          lastError: undefined,
          nextRetryAt: null,
        },
      },
      upsert: true,
    },
  }));

  await PendingCosDelete.bulkWrite(ops, { ordered: false });
  return unique.length;
}

export async function processPendingCosDeletes(
  limit = 100,
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const now = new Date();
  const docs = await PendingCosDelete.find({
    status: { $in: ["pending", "failed"] },
    $expr: { $lt: ["$attempts", "$maxAttempts"] },
    $or: [
      { nextRetryAt: null },
      { nextRetryAt: { $exists: false } },
      { nextRetryAt: { $lte: now } },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  if (!docs.length) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  const keys = docs.map((d) => String(d.cosKey || "")).filter(Boolean);

  try {
    await deleteCosObjects(keys, { timeoutMs: 15000 });
    await PendingCosDelete.updateMany(
      { cosKey: { $in: keys } },
      {
        $set: { status: "done" },
        $unset: { lastError: 1, nextRetryAt: 1 },
      },
    );
    return { processed: keys.length, succeeded: keys.length, failed: 0 };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("pending COS delete batch failed", {
      keys,
      error: errorMsg,
    });

    let failed = 0;
    for (const doc of docs) {
      const attempts = Number(doc.attempts || 0) + 1;
      const maxAttempts = Number(doc.maxAttempts || DEFAULT_MAX_ATTEMPTS);
      const isFinalFailure = attempts >= maxAttempts;
      const backoff = RETRY_BASE_MS * Math.pow(2, Math.min(attempts, 5));

      await PendingCosDelete.updateOne(
        { cosKey: doc.cosKey },
        {
          $set: {
            status: isFinalFailure ? "failed" : "pending",
            attempts,
            lastError: errorMsg,
            nextRetryAt: isFinalFailure ? null : new Date(Date.now() + backoff),
          },
        },
      );
      failed += 1;
    }

    return { processed: docs.length, succeeded: 0, failed };
  }
}
