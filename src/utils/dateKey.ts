/**
 * 与上传额度等业务共用的「自然日」键（yyyy-MM-dd），时区默认与 UPLOAD_QUOTA_TIMEZONE 一致。
 */
export const formatInstantAsDateKey = (date: Date, timezone: string): string => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

export const getDateKeyByTimezone = (timezone: string): string => {
  return formatInstantAsDateKey(new Date(), timezone);
};

/**
 * 解析为该自然日在该时区内的「起始时刻」（该日 00:00 起算对应的最早 UTC 瞬时点）。
 * 必须从候选里取「最早」匹配，否则取到日中时刻时 `previousDateKey` 减 1ms 仍会落在同一天，
 * 连续打卡循环会卡死在上限（如 3660）。
 */
export const resolveInstantForDateKeyInTimeZone = (
  dateKey: string,
  timezone: string,
): Date => {
  const parts = dateKey.split("-").map((v) => Number(v));
  const y = parts[0];
  const mo = parts[1];
  const da = parts[2];
  if (!y || !mo || !da) return new Date(0);
  let bestMs: number | null = null;
  const fromMs = Date.UTC(y, mo - 1, da - 2, 0, 0, 0);
  const toMs = Date.UTC(y, mo - 1, da + 2, 0, 0, 0);
  for (let utcMs = fromMs; utcMs < toMs; utcMs += 60 * 60 * 1000) {
    if (formatInstantAsDateKey(new Date(utcMs), timezone) !== dateKey) continue;
    if (bestMs === null || utcMs < bestMs) bestMs = utcMs;
  }
  if (bestMs !== null) return new Date(bestMs);
  return new Date(Date.UTC(y, mo - 1, da, 12, 0, 0));
};

export const previousDateKey = (dateKey: string, timezone: string): string => {
  const start = resolveInstantForDateKeyInTimeZone(dateKey, timezone);
  return formatInstantAsDateKey(new Date(start.getTime() - 1), timezone);
};

export const getQuotaDateContext = () => {
  const timezone = process.env.UPLOAD_QUOTA_TIMEZONE || "Asia/Shanghai";
  const dateKey = getDateKeyByTimezone(timezone);
  return { timezone, dateKey };
};
