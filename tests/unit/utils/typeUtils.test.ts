import { describe, expect, it } from "vitest";
import {
  toLeanActivity,
  toLeanActivityArray,
  toLeanNote,
  toLeanNoteArray,
  toLeanNoteBook,
  toLeanNoteBookArray,
  toLeanReminder,
  toLeanReminderArray,
  toLeanTemplate,
  toLeanTemplateArray,
} from "../../../src/utils/typeUtils";

describe("unit: typeUtils", () => {
  it("单条转换：有 _id / 无 _id", () => {
    const withId = { _id: { toString: () => "abc" }, __v: 0, name: "n" };
    expect(toLeanNoteBook(withId).id).toBe("abc");
    expect(toLeanNote(withId).id).toBe("abc");
    expect(toLeanActivity(withId).id).toBe("abc");
    expect(toLeanTemplate(withId).id).toBe("abc");
    expect(toLeanReminder(withId).id).toBe("abc");

    const noId = { __v: 0, name: "x" };
    expect(toLeanNoteBook(noId).id).toBe("");
    expect(toLeanNote(noId).id).toBe("");
    expect(toLeanActivity(noId).id).toBe("");
    expect(toLeanTemplate(noId).id).toBe("");
    expect(toLeanReminder(noId).id).toBe("");
  });

  it("批量转换", () => {
    const docs = [
      { _id: { toString: () => "1" }, __v: 0 },
      { _id: { toString: () => "2" }, __v: 0 },
    ];
    expect(toLeanNoteBookArray(docs).map((d) => d.id)).toEqual(["1", "2"]);
    expect(toLeanNoteArray(docs).map((d) => d.id)).toEqual(["1", "2"]);
    expect(toLeanActivityArray(docs).map((d) => d.id)).toEqual(["1", "2"]);
    expect(toLeanTemplateArray(docs).map((d) => d.id)).toEqual(["1", "2"]);
    expect(toLeanReminderArray(docs).map((d) => d.id)).toEqual(["1", "2"]);
  });
});
