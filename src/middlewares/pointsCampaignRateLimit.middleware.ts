import { Context, Next } from "koa";
import { error, ErrorCodes } from "../utils/response";

type Bucket = {
  stamps: number[];
};

const ipBuckets = new Map<string, Bucket>();
const userBuckets = new Map<string, Bucket>();
const MAX_BUCKET_KEYS = 10_000;
const CLEANUP_INTERVAL_MS = 5_000;
const CLEANUP_MAX_DELETE = 2_000;
const ipCleanupState = { lastCleanupAt: 0 };
const userCleanupState = { lastCleanupAt: 0 };

function cleanupBuckets(
  map: Map<string, Bucket>,
  now: number,
  windowMs: number,
  state: { lastCleanupAt: number },
) {
  if (map.size <= MAX_BUCKET_KEYS) return;
  if (now - state.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  state.lastCleanupAt = now;
  let deleted = 0;
  for (const [k, bucket] of map.entries()) {
    const latest = bucket.stamps[bucket.stamps.length - 1] || 0;
    if (now - latest > windowMs) {
      map.delete(k);
      deleted += 1;
      if (deleted >= CLEANUP_MAX_DELETE) break;
    }
  }
}

function checkBucket(map: Map<string, Bucket>, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (map === ipBuckets) cleanupBuckets(map, now, windowMs, ipCleanupState);
  if (map === userBuckets) cleanupBuckets(map, now, windowMs, userCleanupState);
  const bucket = map.get(key) || { stamps: [] };
  bucket.stamps = bucket.stamps.filter((x) => now - x <= windowMs);
  bucket.stamps.push(now);
  map.set(key, bucket);
  return bucket.stamps.length <= limit;
}

export async function pointsCampaignClaimRateLimit(ctx: Context, next: Next) {
  const ipKey = String(ctx.ip || ctx.request.ip || "unknown");
  const userId = String((ctx as unknown as { user?: { userId?: string } }).user?.userId || "");
  const ipOk = checkBucket(ipBuckets, ipKey, 20, 60_000);
  const userOk = userId ? checkBucket(userBuckets, userId, 5, 10_000) : true;
  if (!ipOk || !userOk) {
    error(ctx, "请求过于频繁，请稍后再试", ErrorCodes.TOO_MANY_REQUESTS, 429);
    return;
  }
  await next();
}

