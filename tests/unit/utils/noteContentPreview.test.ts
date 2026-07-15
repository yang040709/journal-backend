import { describe, expect, it } from "vitest";
import {
  NOTE_CONTENT_PREVIEW_MAX_LENGTH,
  buildNoteContentPreview,
  normalizeNotePlainText,
} from "../../../src/utils/noteContentPreview";

describe("noteContentPreview", () => {
  it("normalizeNotePlainText 取首段并保留段内换行", () => {
    expect(
      normalizeNotePlainText("今天很好\n和小羊去玩\n\n第二段忽略"),
    ).toBe("今天很好\n和小羊去玩");
  });

  it("buildNoteContentPreview 保留换行", () => {
    expect(buildNoteContentPreview("昨天忘记记录了\n今天补一下")).toBe(
      "昨天忘记记录了\n今天补一下",
    );
  });

  it("空正文返回空摘要", () => {
    expect(buildNoteContentPreview("")).toBe("");
    expect(buildNoteContentPreview("   \n\n  ")).toBe("");
  });

  it("短正文原样返回", () => {
    expect(buildNoteContentPreview("今天天气很好")).toBe("今天天气很好");
  });

  it("超长正文截断至最大长度", () => {
    const long = "甲".repeat(NOTE_CONTENT_PREVIEW_MAX_LENGTH + 40);
    const preview = buildNoteContentPreview(long);
    expect(preview.length).toBeLessThanOrEqual(NOTE_CONTENT_PREVIEW_MAX_LENGTH);
    expect(preview.startsWith("甲")).toBe(true);
  });
});
