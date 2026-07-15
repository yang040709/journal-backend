import { describe, expect, it } from "vitest";
import {
  checkAndReplaceSensitiveContent,
  checkNoteContent,
  checkSensitiveWords,
  replaceSensitiveWords,
} from "../../../src/utils/sensitive";

describe("unit: sensitive", () => {
  it("checkSensitiveWords 空值与非字符串返回空数组", () => {
    expect(checkSensitiveWords("")).toEqual([]);
    expect(checkSensitiveWords(null as unknown as string)).toEqual([]);
    expect(checkSensitiveWords(123 as unknown as string)).toEqual([]);
  });

  it("检测并替换敏感词", () => {
    const text = "这里有炸弹和test敏感词";
    expect(checkSensitiveWords(text)).toEqual(["炸弹", "test敏感词"]);
    expect(replaceSensitiveWords(text)).toBe("这里有***和***");
    expect(replaceSensitiveWords("" as string)).toBe("");
    expect(replaceSensitiveWords(1 as unknown as string)).toBe(1);
  });

  it("checkAndReplaceSensitiveContent 与 checkNoteContent", () => {
    const clean = checkAndReplaceSensitiveContent("普通文本");
    expect(clean.hasSensitiveWords).toBe(false);
    expect(clean.wasReplaced).toBe(false);

    const dirty = checkAndReplaceSensitiveContent("有炸弹");
    expect(dirty.hasSensitiveWords).toBe(true);
    expect(dirty.wasReplaced).toBe(true);
    expect(dirty.processedText).toContain("***");

    const note = checkNoteContent("炸弹标题", "无敏感");
    expect(note.titleHasSensitive).toBe(true);
    expect(note.contentHasSensitive).toBe(false);
    expect(note.hasAnySensitive).toBe(true);
    expect(note.processedTitle).toContain("***");
  });
});
