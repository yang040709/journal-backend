import {
  formatInstantAsDateKey,
  previousDateKey,
  resolveInstantForDateKeyInTimeZone,
} from "./dateKey";

/** 业务时区下「周一」的短格式 weekday（依赖 Intl en） */
function weekdayShortInTz(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
}

/** 返回包含 `instant` 的那一周：周一 00:00（含）至下周一 00:00（不含），均按 timezone 日历。 */
export function getZonedWeekRangeUtc(
  instant: Date,
  timezone: string,
): { weekStartUtc: Date; weekEndExclusiveUtc: Date } {
  let dateKey = formatInstantAsDateKey(instant, timezone);
  for (let i = 0; i < 7; i++) {
    const dayStart = resolveInstantForDateKeyInTimeZone(dateKey, timezone);
    const noon = new Date(dayStart.getTime() + 12 * 3600 * 1000);
    const wd = weekdayShortInTz(noon, timezone);
    if (wd === "Mon") {
      const weekStartUtc = dayStart;
      const weekEndExclusiveUtc = new Date(weekStartUtc.getTime() + 7 * 24 * 3600 * 1000);
      return { weekStartUtc, weekEndExclusiveUtc };
    }
    dateKey = previousDateKey(dateKey, timezone);
  }
  const fallback = resolveInstantForDateKeyInTimeZone(
    formatInstantAsDateKey(instant, timezone),
    timezone,
  );
  return {
    weekStartUtc: fallback,
    weekEndExclusiveUtc: new Date(fallback.getTime() + 7 * 24 * 3600 * 1000),
  };
}
