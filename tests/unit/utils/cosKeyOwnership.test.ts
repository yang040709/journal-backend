import { afterEach, describe, expect, it } from "vitest";
import {
  assertOwnedCosKey,
  assertOwnedNoteImageKeys,
  collectNoteImageKeys,
  CosKeyOwnershipError,
  getOwnedCosKeyPrefix,
  isOwnedCosKey,
  normalizeNoteImageObjectKeys,
} from "../../../src/utils/cosKeyOwnership";
import { resolveAssetObjectKey } from "../../../src/utils/cosDelete";

describe("unit: cosKeyOwnership", () => {
  const prev = process.env.COS_UPLOAD_DIR;

  afterEach(() => {
    process.env.COS_UPLOAD_DIR = prev;
  });

  it("getOwnedCosKeyPrefix 使用 COS_UPLOAD_DIR 与 userId", () => {
    process.env.COS_UPLOAD_DIR = "journal";
    expect(getOwnedCosKeyPrefix("u1")).toBe("journal/u1/");
  });

  it("拒绝他人前缀与路径穿越", () => {
    process.env.COS_UPLOAD_DIR = "journal";
    expect(isOwnedCosKey("u1", "journal/u1/202601/a.jpg")).toBe(true);
    expect(isOwnedCosKey("u1", "journal/u2/202601/a.jpg")).toBe(false);
    expect(isOwnedCosKey("u1", "../journal/u1/a.jpg")).toBe(false);
    expect(() => assertOwnedCosKey("u1", "journal/other/x.jpg")).toThrow(
      CosKeyOwnershipError,
    );
  });

  it("assertOwnedNoteImageKeys 校验 key 与 thumbKey", () => {
    process.env.COS_UPLOAD_DIR = "journal";
    expect(() =>
      assertOwnedNoteImageKeys("u1", [
        { key: "journal/u1/a.jpg", thumbKey: "journal/u2/a-mini.jpg" },
      ]),
    ).toThrow(CosKeyOwnershipError);

    expect(() =>
      assertOwnedNoteImageKeys("u1", [
        { key: "journal/u1/a.jpg", thumbKey: "journal/u1/a-mini.jpg" },
      ]),
    ).not.toThrow();
  });

  it("allowKeys 可祖父放行本笔记已有脏 key（如 cover:）", () => {
    process.env.COS_UPLOAD_DIR = "journal";
    const existing = "cover:69f5c333459b1e08c3a850a3";
    expect(() =>
      assertOwnedNoteImageKeys(
        "u1",
        [{ key: existing }, { key: "journal/u1/new.jpg" }],
        { allowKeys: collectNoteImageKeys([{ key: existing }]) },
      ),
    ).not.toThrow();

    expect(() =>
      assertOwnedNoteImageKeys(
        "u1",
        [{ key: "cover:new-not-on-note" }],
        { allowKeys: [existing] },
      ),
    ).toThrow(CosKeyOwnershipError);
  });

  it("CosKeyOwnershipError 默认文案面向用户", () => {
    expect(new CosKeyOwnershipError().message).toBe(
      "图片无效或不属于当前账号",
    );
  });

  it("normalizeNoteImageObjectKeys 将 cover: 伪 key 从 url 还原", () => {
    const out = normalizeNoteImageObjectKeys([
      {
        key: "cover:69f5c333459b1e08c3a850a3",
        url: "https://cdn.example.com/journal/u1/202605/a.png",
        thumbKey: "cover:69f5c333459b1e08c3a850a3",
        thumbUrl: "https://cdn.example.com/journal/u1/202605/a-mini.jpg",
      },
    ]);
    expect(out?.[0]?.key).toBe("journal/u1/202605/a.png");
    expect(out?.[0]?.thumbKey).toBe("journal/u1/202605/a-mini.jpg");
  });

  it("resolveAssetObjectKey 封面伪 key 走 url", () => {
    expect(
      resolveAssetObjectKey({
        storageKey: "cover:abc",
        url: "https://cdn.example.com/journal/u1/x.png",
      }),
    ).toBe("journal/u1/x.png");
    expect(
      resolveAssetObjectKey({
        storageKey: "journal/u1/x.png",
        url: "https://cdn.example.com/other.png",
      }),
    ).toBe("journal/u1/x.png");
  });
});
