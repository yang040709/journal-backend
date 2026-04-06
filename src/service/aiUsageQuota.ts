import User from "../model/User";
import UserAiUsageDaily from "../model/UserAiUsageDaily";
import { getQuotaDateContext } from "../utils/dateKey";
import { QuotaBaseLimitsService } from "./quotaBaseLimits.service";

export const getAiDailyBaseLimit = async (): Promise<number> => {
  const limits = await QuotaBaseLimitsService.getQuotaBaseLimits();
  return limits.aiDailyBaseLimit;
};

export const getUserAiBonusQuota = async (userId: string): Promise<number> => {
  const user = await User.findOne({ userId }).select("aiBonusQuota").lean();
  if (!user) return 0;
  const value = Number((user as { aiBonusQuota?: number }).aiBonusQuota ?? 0);
  return Math.max(0, Math.floor(value));
};

/** 当日可用总次数（基础 + 永久额外） */
export const getAiDailyLimitForUser = async (userId: string): Promise<number> => {
  const baseLimit = await getAiDailyBaseLimit();
  const bonus = await getUserAiBonusQuota(userId);
  return baseLimit + bonus;
};

export const ensureDailyUsageDoc = async (userId: string, dateKey: string) => {
  await UserAiUsageDaily.updateOne(
    { userId, dateKey },
    {
      $setOnInsert: {
        userId,
        dateKey,
        usedCount: 0,
      },
    },
    { upsert: true },
  );
};

export const tryConsumeAiUsage = async (
  userId: string,
  dateKey: string,
  dailyLimit: number,
): Promise<{ ok: true; newUsed: number } | { ok: false }> => {
  await ensureDailyUsageDoc(userId, dateKey);
  const updated = await UserAiUsageDaily.findOneAndUpdate(
    { userId, dateKey, usedCount: { $lt: dailyLimit } },
    { $inc: { usedCount: 1 } },
    { new: true },
  ).lean();
  if (!updated) {
    return { ok: false };
  }
  return { ok: true, newUsed: updated.usedCount };
};

export const rollbackAiUsage = async (userId: string, dateKey: string) => {
  await UserAiUsageDaily.updateOne(
    { userId, dateKey, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } },
  );
};

export const createAiDailyLimitExceededError = (dailyLimit: number): Error => {
  const err = new Error(`今日 AI 次数已用完（每日 ${dailyLimit} 次），请明日再试`);
  (err as Error & { code: string }).code = "AI_DAILY_LIMIT_EXCEEDED";
  return err;
};

/** 扣减一次配额；失败抛出 AI_DAILY_LIMIT_EXCEEDED */
export const reserveOneAiUsageOrThrow = async (
  userId: string,
): Promise<{ dateKey: string; dailyLimit: number; newUsed: number }> => {
  const { dateKey } = getQuotaDateContext();
  const dailyLimit = await getAiDailyLimitForUser(userId);
  const reserved = await tryConsumeAiUsage(userId, dateKey, dailyLimit);
  if (!reserved.ok) {
    throw createAiDailyLimitExceededError(dailyLimit);
  }
  return { dateKey, dailyLimit, newUsed: reserved.newUsed };
};

export const remainingAfterUse = (dailyLimit: number, newUsed: number): number =>
  Math.max(0, dailyLimit - newUsed);
