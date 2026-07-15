import { describe, expect, it } from "vitest";
import {
  DISPLAY_PREFERENCE_SETTING_KEYS,
  formatDisplayPreferenceValue,
  getDisplayPreferenceSettingMeta,
} from "../../../src/constant/displayPreference";

describe("unit: displayPreference", () => {
  it("setting keys 与 meta 查找", () => {
    expect(DISPLAY_PREFERENCE_SETTING_KEYS.length).toBeGreaterThan(0);
    expect(getDisplayPreferenceSettingMeta("showNoteWordCount")?.type).toBe(
      "boolean",
    );
    expect(getDisplayPreferenceSettingMeta("missing")).toBeUndefined();
  });

  it("formatDisplayPreferenceValue 映射 option label", () => {
    expect(formatDisplayPreferenceValue("showNoteWordCount", true)).toBe(
      "开启",
    );
    expect(formatDisplayPreferenceValue("showNoteWordCount", false)).toBe(
      "关闭",
    );
    expect(
      formatDisplayPreferenceValue("albumCoverNoImageStyle", "watermark"),
    ).toBe("艺术日期");
    expect(formatDisplayPreferenceValue("unknownKey", 1)).toBe("1");
    expect(
      formatDisplayPreferenceValue("albumCoverNoImageStyle", "not-in-list"),
    ).toBe("not-in-list");
  });
});
