import { describe, expect, it } from "vitest";
import {
  ensurePageDepth,
  escapeRegex,
  normalizeKeyword,
  pickSortField,
  toSafeRegex,
} from "../../../src/utils/querySafety";

describe("escapeRegex", () => {
  it("转义正则特殊字符", () => {
    expect(escapeRegex("a.b*c?")).toBe("a\\.b\\*c\\?");
  });

  it("普通字符串保持不变", () => {
    expect(escapeRegex("hello")).toBe("hello");
  });
});

describe("normalizeKeyword", () => {
  it("空值返回空字符串", () => {
    expect(normalizeKeyword(undefined)).toBe("");
    expect(normalizeKeyword("   ")).toBe("");
  });

  it("合法关键词 trim 后返回", () => {
    expect(normalizeKeyword("  日记  ")).toBe("日记");
  });

  it("低于 min 长度时抛出错误", () => {
    expect(() => normalizeKeyword("a", { min: 2 })).toThrow(
      "搜索关键词至少 2 个字符",
    );
  });

  it("超过 max 长度时抛出错误", () => {
    expect(() => normalizeKeyword("abcdef", { max: 3 })).toThrow(
      "搜索关键词不能超过 3 个字符",
    );
  });
});

describe("toSafeRegex", () => {
  it("将含特殊字符的关键词编译为字面量匹配", () => {
    const regex = toSafeRegex("a+b");
    expect("xx a+b yy".match(regex)?.[0]).toBe("a+b");
    expect("ab".match(regex)).toBeNull();
  });
});

describe("pickSortField", () => {
  const allowed = ["createdAt", "updatedAt"] as const;

  it("白名单内字段原样返回", () => {
    expect(pickSortField(allowed, "updatedAt", "createdAt")).toBe("updatedAt");
  });

  it("非法或空值回退 fallback", () => {
    expect(pickSortField(allowed, "deletedAt", "createdAt")).toBe("createdAt");
    expect(pickSortField(allowed, "", "createdAt")).toBe("createdAt");
  });
});

describe("ensurePageDepth", () => {
  it("page*limit 在限制内不抛错", () => {
    expect(() =>
      ensurePageDepth({ page: 2, limit: 10, maxDepth: 100 }),
    ).not.toThrow();
  });

  it("page*limit 超过限制时抛出错误", () => {
    expect(() =>
      ensurePageDepth({ page: 11, limit: 10, maxDepth: 100, label: "搜索分页" }),
    ).toThrow("搜索分页超过限制（page*limit <= 100）");
  });
});
