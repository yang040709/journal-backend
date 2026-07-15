import { afterEach, describe, expect, it } from "vitest";
import {
  extractCosKeyFromUrl,
  isCosObjectKey,
  resolveAssetObjectKey,
} from "../../../src/utils/cosDelete";

describe("unit: cosDelete helpers", () => {
  const prevDomain = process.env.COS_PUBLIC_DOMAIN;

  afterEach(() => {
    if (prevDomain === undefined) {
      delete process.env.COS_PUBLIC_DOMAIN;
    } else {
      process.env.COS_PUBLIC_DOMAIN = prevDomain;
    }
  });

  it("isCosObjectKey 过滤 cover: 与空值", () => {
    expect(isCosObjectKey("journal/u/1.png")).toBe(true);
    expect(isCosObjectKey("cover:abc")).toBe(false);
    expect(isCosObjectKey("")).toBe(false);
    expect(isCosObjectKey("alone")).toBe(false);
  });

  it("extractCosKeyFromUrl 支持公共域名与 pathname", () => {
    process.env.COS_PUBLIC_DOMAIN = "https://cdn.example.com";
    expect(
      extractCosKeyFromUrl("https://cdn.example.com/journal/u/a.png"),
    ).toBe("journal/u/a.png");
    expect(
      extractCosKeyFromUrl("https://other.example.com/bucket/path/x.png"),
    ).toBe("bucket/path/x.png");
    expect(extractCosKeyFromUrl("")).toBeNull();
    expect(extractCosKeyFromUrl("not-a-url")).toBeNull();
  });

  it("resolveAssetObjectKey 优先 storageKey，否则从 url 解析", () => {
    expect(
      resolveAssetObjectKey({ storageKey: "journal/u/a.png" }),
    ).toBe("journal/u/a.png");
    process.env.COS_PUBLIC_DOMAIN = "https://cdn.example.com";
    expect(
      resolveAssetObjectKey({
        storageKey: "cover:1",
        url: "https://cdn.example.com/journal/u/b.png",
      }),
    ).toBe("journal/u/b.png");
  });
});
