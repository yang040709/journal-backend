import { describe, expect, it } from "vitest";
import { ReminderService } from "../../../src/service/reminder.service";

describe("unit: ReminderService.formatTime", () => {
  it("UTC 瞬间格式化为上海墙钟 YYYY-MM-DD HH:mm", () => {
    // 2026-01-01 16:00 UTC = 2026-01-02 00:00 Asia/Shanghai
    expect(
      ReminderService.formatTime(new Date("2026-01-01T16:00:00.000Z")),
    ).toBe("2026-01-02 00:00");
  });

  it("跨日边界", () => {
    expect(
      ReminderService.formatTime(new Date("2026-06-15T15:59:00.000Z")),
    ).toBe("2026-06-15 23:59");
  });

  it("跨年边界", () => {
    expect(
      ReminderService.formatTime(new Date("2025-12-31T16:30:00.000Z")),
    ).toBe("2026-01-01 00:30");
  });
});
