import { describe, expect, it } from "vitest";
import {
  enumerateZonedYmdInclusive,
  zonedRangeUtcBounds,
  zonedYmdToUtcEndExclusive,
  zonedYmdToUtcStart,
} from "../../../src/utils/zonedDayBounds";

describe("unit: zonedDayBounds", () => {
  const tz = "Asia/Shanghai";

  it("解析合法 ymd 为 UTC 区间", () => {
    const start = zonedYmdToUtcStart("2026-01-15", tz);
    const end = zonedYmdToUtcEndExclusive("2026-01-15", tz);
    expect(start.getTime()).toBeLessThan(end.getTime());
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);

    const range = zonedRangeUtcBounds("2026-01-15", "2026-01-16", tz);
    expect(range.fromInclusive.getTime()).toBe(start.getTime());
    expect(range.toExclusive.getTime()).toBeGreaterThan(end.getTime());
  });

  it("非法 ymd 抛错", () => {
    expect(() => zonedYmdToUtcStart("bad", tz)).toThrow("invalid ymd");
    expect(() => zonedYmdToUtcStart("2026-00-01", tz)).toThrow("invalid ymd");
  });

  it("enumerateZonedYmdInclusive 含端点；反向返回空", () => {
    expect(enumerateZonedYmdInclusive("2026-03-01", "2026-03-03", tz)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
    expect(enumerateZonedYmdInclusive("2026-03-03", "2026-03-01", tz)).toEqual(
      [],
    );
  });
});
