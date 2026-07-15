import AdminLoginLock from "../model/AdminLoginLock";
import {
  ADMIN_LOGIN_WINDOW_MS,
  getAdminLoginIpLimit,
  getAdminLoginLockFailThreshold,
  getAdminLoginLockMinutes,
  getAdminLoginUsernameLimit,
  getAdminLoginCaptchaCreateIpLimit,
} from "../config/adminLoginEnv";
import {
  AdminLoginLockedError,
  AdminLoginRateLimitError,
} from "../errors/adminLogin.errors";

type Bucket = {
  stamps: number[];
};

const ipBuckets = new Map<string, Bucket>();
const usernameBuckets = new Map<string, Bucket>();
const captchaCreateIpBuckets = new Map<string, Bucket>();
const MAX_BUCKET_KEYS = 10_000;
const CLEANUP_INTERVAL_MS = 5_000;
const CLEANUP_MAX_DELETE = 2_000;

function cleanupBuckets(map: Map<string, Bucket>, now: number, windowMs: number) {
  if (map.size <= MAX_BUCKET_KEYS) return;
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

function consumeBucket(
  map: Map<string, Bucket>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  cleanupBuckets(map, now, windowMs);
  const bucket = map.get(key) || { stamps: [] };
  bucket.stamps = bucket.stamps.filter((x) => now - x <= windowMs);
  bucket.stamps.push(now);
  map.set(key, bucket);
  return bucket.stamps.length <= limit;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export class AdminLoginRateLimitService {
  static consumeIpLimit(ip: string): void {
    const ok = consumeBucket(
      ipBuckets,
      ip || "unknown",
      getAdminLoginIpLimit(),
      ADMIN_LOGIN_WINDOW_MS,
    );
    if (!ok) {
      throw new AdminLoginRateLimitError();
    }
  }

  static consumeUsernameLimit(username: string): void {
    const key = normalizeUsername(username);
    if (!key) return;
    const ok = consumeBucket(
      usernameBuckets,
      key,
      getAdminLoginUsernameLimit(),
      ADMIN_LOGIN_WINDOW_MS,
    );
    if (!ok) {
      throw new AdminLoginRateLimitError("该账号登录尝试过于频繁，请稍后再试");
    }
  }

  static consumeCaptchaCreateIpLimit(ip: string): void {
    const ok = consumeBucket(
      captchaCreateIpBuckets,
      ip || "unknown",
      getAdminLoginCaptchaCreateIpLimit(),
      ADMIN_LOGIN_WINDOW_MS,
    );
    if (!ok) {
      throw new AdminLoginRateLimitError("验证码请求过于频繁，请稍后再试");
    }
  }

  static async assertNotLocked(username: string): Promise<void> {
    const key = normalizeUsername(username);
    if (!key) return;

    const doc = await AdminLoginLock.findOne({ username: key }).lean();
    if (!doc?.lockedUntil) return;

    const lockedUntilMs = new Date(doc.lockedUntil).getTime();
    if (lockedUntilMs <= Date.now()) {
      await AdminLoginLock.updateOne(
        { username: key },
        { $set: { lockedUntil: null, failStreak: 0 } },
      );
      return;
    }

    const remainMinutes = Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 60_000));
    throw new AdminLoginLockedError(
      `账号已锁定，请 ${remainMinutes} 分钟后再试`,
    );
  }

  static async recordPasswordFail(username: string): Promise<void> {
    const key = normalizeUsername(username);
    if (!key) return;

    const threshold = getAdminLoginLockFailThreshold();
    const lockMinutes = getAdminLoginLockMinutes();
    const now = new Date();
    const lockUntil = new Date(now.getTime() + lockMinutes * 60_000);
    const expiresAt = new Date(now.getTime() + lockMinutes * 60_000 + 60_000);

    const doc = await AdminLoginLock.findOne({ username: key });
    if (!doc) {
      const failStreak = 1;
      await AdminLoginLock.create({
        username: key,
        failStreak,
        lockedUntil: failStreak >= threshold ? lockUntil : null,
        expiresAt,
      });
      return;
    }

    const failStreak = (doc.failStreak || 0) + 1;
    doc.failStreak = failStreak;
    doc.expiresAt = expiresAt;
    if (failStreak >= threshold) {
      doc.lockedUntil = lockUntil;
    }
    await doc.save();
  }

  static async clearFailStreak(username: string): Promise<void> {
    const key = normalizeUsername(username);
    if (!key) return;
    await AdminLoginLock.deleteOne({ username: key });
  }

  /** 测试清理 */
  static resetForTest(): void {
    ipBuckets.clear();
    usernameBuckets.clear();
    captchaCreateIpBuckets.clear();
  }
}
