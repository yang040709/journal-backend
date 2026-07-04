import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshToken, signToken, verifyToken } from "../../../src/utils/jwt";

const TEST_SECRET = "test-jwt-secret-at-least-32-chars-long!!";

describe("jwt utils", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("signToken 与 verifyToken 可往返解码", () => {
    const token = signToken({ userId: "user-1" });
    const decoded = verifyToken(token);
    expect(decoded).toMatchObject({ userId: "user-1" });
  });

  it("错误 secret 时 verifyToken 返回 null", () => {
    const token = signToken({ userId: "user-1" });
    process.env.JWT_SECRET = "wrong-secret-that-is-long-enough!!";
    expect(verifyToken(token)).toBeNull();
  });

  it("过期 token 默认 verifyToken 返回 null", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const token = jwt.sign({ userId: "user-1" }, TEST_SECRET, {
      expiresIn: "1s",
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:10Z"));
    expect(verifyToken(token)).toBeNull();
  });

  it("过期 token 在 ignoreExpiration 下仍可解码", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const token = jwt.sign({ userId: "user-1" }, TEST_SECRET, {
      expiresIn: "1s",
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:10Z"));
    expect(verifyToken(token, true)).toMatchObject({ userId: "user-1" });
  });

  it("refreshToken 在过期 30 分钟窗口内可刷新", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const token = jwt.sign({ userId: "user-1" }, TEST_SECRET, {
      expiresIn: "1s",
    });

    vi.setSystemTime(new Date("2026-01-01T00:10:00Z"));
    const refreshed = refreshToken(token);
    expect(refreshed).toBeTruthy();
    expect(verifyToken(refreshed!, true)).toMatchObject({ userId: "user-1" });
  });

  it("refreshToken 过期超过 30 分钟返回 null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const token = jwt.sign({ userId: "user-1" }, TEST_SECRET, {
      expiresIn: "1s",
    });

    vi.setSystemTime(new Date("2026-01-01T01:00:00Z"));
    expect(refreshToken(token)).toBeNull();
  });

  it("缺少 JWT_SECRET 时 signToken 抛出错误", () => {
    delete process.env.JWT_SECRET;
    expect(() => signToken({ userId: "user-1" })).toThrow("JWT_SECRET");
  });
});
