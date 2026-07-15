import { describe, expect, it } from "vitest";
import {
  checkAndReplaceSensitiveContent,
  checkNoteContent,
  checkSensitiveWords,
  getSensitiveFilterStatus,
  initSensitiveFilter,
  reloadSensitiveFilter,
  replaceSensitiveWords,
} from "../../../src/utils/sensitive-encrypted";

describe("unit: sensitive-encrypted", () => {
  it("未初始化时安全降级；init/reload 可调用", async () => {
    const status0 = getSensitiveFilterStatus();
    expect(status0.algorithm).toContain("mint-filter");

    expect(checkSensitiveWords("")).toEqual([]);
    expect(checkSensitiveWords(1 as unknown as string)).toEqual([]);
    expect(replaceSensitiveWords("plain")).toBe("plain");
    expect(replaceSensitiveWords("" as string)).toBe("");

    const result = checkAndReplaceSensitiveContent("普通文本");
    expect(result.hasSensitiveWords).toBe(false);
    expect(result.wasReplaced).toBe(false);

    const note = checkNoteContent("标题", "内容");
    expect(note.hasAnySensitive).toBe(false);

    await initSensitiveFilter();
    await reloadSensitiveFilter();
    expect(getSensitiveFilterStatus().algorithm).toBeTruthy();
  });
});
