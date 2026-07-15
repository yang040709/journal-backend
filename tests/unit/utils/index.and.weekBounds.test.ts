import { describe, expect, it } from "vitest";
import { createError, createResponse } from "../../../src/utils/index";
import { getZonedWeekRangeUtc } from "../../../src/utils/weekBounds";

describe("unit: utils index + weekBounds", () => {
  it("createResponse / createError", () => {
    expect(createResponse({ a: 1 })).toEqual({
      code: 0,
      message: "success",
      data: { a: 1 },
    });
    expect(createError("x")).toEqual({ code: -1, message: "x" });
    expect(createError("y", 400)).toEqual({ code: 400, message: "y" });
  });

  it("getZonedWeekRangeUtc 返回含起始日的一周区间", () => {
    const range = getZonedWeekRangeUtc(
      new Date("2026-07-15T08:00:00+08:00"),
      "Asia/Shanghai",
    );
    expect(range.weekEndExclusiveUtc.getTime()).toBeGreaterThan(
      range.weekStartUtc.getTime(),
    );
    expect(
      range.weekEndExclusiveUtc.getTime() - range.weekStartUtc.getTime(),
    ).toBe(7 * 24 * 3600 * 1000);
  });
});
