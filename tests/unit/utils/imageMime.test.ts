import { describe, expect, it } from "vitest";
import {
  normalizeImageMimeType,
  normalizeNoteImageMime,
} from "../../../src/utils/imageMime";

describe("unit: imageMime", () => {
  it("规范化已知 mime 与 image/jpg 别名", () => {
    expect(normalizeImageMimeType("image/png")).toBe("image/png");
    expect(normalizeImageMimeType(" image/webp ")).toBe("image/webp");
    expect(normalizeImageMimeType("image/jpg")).toBe("image/jpeg");
    expect(normalizeImageMimeType(null)).toBe("");
  });

  it("从 url/文件名扩展名推断", () => {
    expect(normalizeImageMimeType("", "a.JPEG?x=1")).toBe("image/jpeg");
    expect(normalizeImageMimeType("unknown", "photo.png#frag")).toBe(
      "image/png",
    );
    expect(normalizeImageMimeType("", "noext")).toBe("");
    expect(normalizeImageMimeType("", "a.gif")).toBe("");
  });

  it("normalizeNoteImageMime 读对象字段", () => {
    expect(
      normalizeNoteImageMime({ mimeType: "image/png", url: "x.jpg" }),
    ).toBe("image/png");
    expect(normalizeNoteImageMime({ url: "https://cdn/a.webp" })).toBe(
      "image/webp",
    );
  });
});
