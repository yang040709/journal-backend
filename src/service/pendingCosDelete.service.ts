import PendingCosDelete, {
  type PendingCosDeleteStatus,
} from "../model/PendingCosDelete";
import { deleteCosObjects, isCosObjectKey } from "../utils/cosDelete";
import { isOwnedCosKey } from "../utils/cosKeyOwnership";
import { logger } from "../utils/logger";

const DEFAULT_MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 60_000;
/** processing 卡住超过该时间则回收为 pending */
export const COS_DELETE_STUCK_MS = 15 * 60 * 1000;

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

  // 带 userId 时再滤非本人前缀；无 userId（遗留调用）仅保 isCosObjectKey
  const owned = options.userId
    ? unique.filter((k) => isOwnedCosKey(options.userId!, k))
    : unique;

  if (!owned.length) return 0;

  const ops = owned.map((cosKey) => ({
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
          lockedAt: null,
        },
      },
      upsert: true,
    },
  }));

  await PendingCosDelete.bulkWrite(ops, { ordered: false });
  return owned.length;
}

async function reclaimStuckProcessing(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - COS_DELETE_STUCK_MS);
  const result = await PendingCosDelete.updateMany(
    {
      status: "processing",
      $or: [
        { lockedAt: { $lte: cutoff } },
        { lockedAt: null },
        { lockedAt: { $exists: false } },
      ],
    },
    {
      $set: {
        status: "pending",
        nextRetryAt: null,
        lockedAt: null,
      },
    },
  );
  return result.modifiedCount || 0;
}

async function claimNextBatch(limit: number, now: Date) {
  const claimed: Array<{
    cosKey: string;
    userId?: string;
    attempts: number;
    maxAttempts: number;
  }> = [];

  for (let i = 0; i < limit; i += 1) {
    const doc = await PendingCosDelete.findOneAndUpdate(
      {
        status: { $in: ["pending", "failed"] },
        $expr: { $lt: ["$attempts", "$maxAttempts"] },
        $or: [
          { nextRetryAt: null },
          { nextRetryAt: { $exists: false } },
          { nextRetryAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: "processing",
          lockedAt: now,
        },
      },
      { sort: { createdAt: 1 }, new: true },
    ).lean();

    if (!doc) break;
    claimed.push({
      cosKey: String(doc.cosKey || ""),
      userId: doc.userId ? String(doc.userId) : undefined,
      attempts: Number(doc.attempts || 0),
      maxAttempts: Number(doc.maxAttempts || DEFAULT_MAX_ATTEMPTS),
    });
  }

  return claimed;
}

async function markDone(cosKey: string): Promise<void> {
  await PendingCosDelete.updateOne(
    { cosKey, status: "processing" },
    {
      $set: { status: "done", lockedAt: null },
      $unset: { lastError: 1, nextRetryAt: 1 },
    },
  );
}

async function markAttemptFailure(
  cosKey: string,
  attemptsBefore: number,
  maxAttempts: number,
  errorMsg: string,
): Promise<void> {
  const attempts = attemptsBefore + 1;
  const isFinalFailure = attempts >= maxAttempts;
  const backoff = RETRY_BASE_MS * Math.pow(2, Math.min(attempts, 5));

  await PendingCosDelete.updateOne(
    { cosKey, status: "processing" },
    {
      $set: {
        status: isFinalFailure ? "failed" : "pending",
        attempts,
        lastError: errorMsg,
        nextRetryAt: isFinalFailure ? null : new Date(Date.now() + backoff),
        lockedAt: null,
      },
    },
  );
}

export async function processPendingCosDeletes(
  limit = 100,
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const now = new Date();
  const reclaimed = await reclaimStuckProcessing(now);
  if (reclaimed > 0) {
    logger.info("pending COS delete: reclaimed stuck processing", { reclaimed });
  }

  const claimed = await claimNextBatch(limit, now);
  if (!claimed.length) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const doc of claimed) {
    const cosKey = doc.cosKey;
    if (!cosKey || !isCosObjectKey(cosKey)) {
      await markAttemptFailure(
        cosKey || doc.cosKey,
        doc.attempts,
        doc.maxAttempts,
        "invalid cos object key",
      );
      failed += 1;
      continue;
    }

    if (doc.userId && !isOwnedCosKey(doc.userId, cosKey)) {
      await markAttemptFailure(
        cosKey,
        doc.attempts,
        doc.maxAttempts,
        "cos key ownership mismatch",
      );
      failed += 1;
      continue;
    }

    try {
      await deleteCosObjects([cosKey], { timeoutMs: 15000 });
      await markDone(cosKey);
      succeeded += 1;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn("pending COS delete key failed", {
        cosKey,
        error: errorMsg,
      });
      await markAttemptFailure(cosKey, doc.attempts, doc.maxAttempts, errorMsg);
      failed += 1;
    }
  }

  return {
    processed: claimed.length,
    succeeded,
    failed,
  };
}
