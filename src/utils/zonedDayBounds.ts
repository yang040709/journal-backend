/**
 * 将「业务时区」下的日历日 yyyy-MM-dd 转为 UTC 时刻区间，供 Mongo 范围查询。
 * 与 {@link getDateKeyByTimezone} / UPLOAD_QUOTA_TIMEZONE 对齐。
 */

const ymdFmt = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

/** 该时区下 ymd 当天 00:00:00 对应的 UTC Date（包含） */
export function zonedYmdToUtcStart(ymd: string, timeZone: string): Date {
  const [Y, Mo, D] = ymd.split("-").map(Number);
  if (!Y || !Mo || !D) {
    throw new Error("invalid ymd");
  }
  const key = `${Y}-${String(Mo).padStart(2, "0")}-${String(D).padStart(2, "0")}`;
  const fmt = ymdFmt(timeZone);
  const base = Date.UTC(Y, Mo - 1, D, 0, 0, 0);
  for (let h = -14; h <= 14; h++) {
    const t = base + h * 3600 * 1000;
    if (fmt.format(new Date(t)) === key) {
      let lo = t;
      for (let k = 0; k < 48; k++) {
        const t2 = lo - 3600 * 1000;
        if (fmt.format(new Date(t2)) !== key) {
          break;
        }
        lo = t2;
      }
      return new Date(lo);
    }
  }
  throw new Error(`zonedYmdToUtcStart: cannot resolve ${ymd} in ${timeZone}`);
}

/** 该时区下 ymd 次日 00:00:00 对应的 UTC Date（不包含），即 [start, end) 的右端点 */
export function zonedYmdToUtcEndExclusive(ymd: string, timeZone: string): Date {
  const start = zonedYmdToUtcStart(ymd, timeZone);
  const fmt = ymdFmt(timeZone);
  const y0 = fmt.format(start);
  let t = start.getTime();
  for (let i = 0; i < 30 * 24; i++) {
    t += 3600 * 1000;
    if (fmt.format(new Date(t)) !== y0) {
      return new Date(t);
    }
  }
  throw new Error(`zonedYmdToUtcEndExclusive: failed for ${ymd} ${timeZone}`);
}

export function zonedRangeUtcBounds(
  startYmd: string,
  endYmd: string,
  timeZone: string,
): { fromInclusive: Date; toExclusive: Date } {
  return {
    fromInclusive: zonedYmdToUtcStart(startYmd, timeZone),
    toExclusive: zonedYmdToUtcEndExclusive(endYmd, timeZone),
  };
}

/** [startYmd, endYmd] 在 timeZone 下每个自然日键（与 dateKey / $dateToString 一致） */
export function enumerateZonedYmdInclusive(
  startYmd: string,
  endYmd: string,
  timeZone: string,
): string[] {
  if (startYmd > endYmd) {
    return [];
  }
  const fmt = ymdFmt(timeZone);
  const endExcl = zonedYmdToUtcEndExclusive(endYmd, timeZone);
  const keys: string[] = [];
  let t = zonedYmdToUtcStart(startYmd, timeZone);
  while (t < endExcl) {
    const ymd = fmt.format(t);
    keys.push(ymd);
    t = zonedYmdToUtcEndExclusive(ymd, timeZone);
  }
  return keys;
}
