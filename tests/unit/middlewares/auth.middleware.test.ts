import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authMiddleware, AuthContext } from "../../../src/middlewares/auth.middleware";
import { ErrorCodes } from "../../../src/utils/response";

vi.mock("../../../src/model/User", () => ({
  default: {
    exists: vi.fn(),
  },
}));

vi.mock("../../../src/utils/logger", () => ({
  default: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import User from "../../../src/model/User";

const TEST_SECRET = "test-jwt-secret-at-least-32-chars-long!!";

function createContext(authHeader?: string): AuthContext {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    status: 200,
    body: undefined,
    state: { requestId: "test-req-id" },
  } as AuthContext;
}

describe("authMiddleware", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    vi.mocked(User.exists).mockReset();
  });

  it("缺少 Authorization 时返回 401", async () => {
    const ctx = createContext();
    const next = vi.fn();

    await authMiddleware(ctx, next);

    expect(ctx.status).toBe(401);
    expect(ctx.body).toMatchObject({
      code: 1002,
      message: "认证失败：缺少或无效的Token",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("Token 已过期时返回 401", async () => {
    const token = jwt.sign({ userId: "user-1" }, TEST_SECRET, {
      expiresIn: "-1s",
    });
    const ctx = createContext(`Bearer ${token}`);
    const next = vi.fn();

    await authMiddleware(ctx, next);

    expect(ctx.status).toBe(401);
    expect(ctx.body).toMatchObject({
      code: 1002,
      message: "认证失败：Token已过期",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("Token 有效但用户不存在时返回 401", async () => {
    const token = jwt.sign({ userId: "missing-user" }, TEST_SECRET, {
      expiresIn: "1h",
    });
    vi.mocked(User.exists).mockResolvedValue(null);

    const ctx = createContext(`Bearer ${token}`);
    const next = vi.fn();

    await authMiddleware(ctx, next);

    expect(User.exists).toHaveBeenCalledWith({ userId: "missing-user" });
    expect(ctx.status).toBe(401);
    expect(ctx.body).toMatchObject({
      code: ErrorCodes.AUTH_ERROR,
      message: "认证失败：用户不存在，请重新登录",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("Token 有效且用户存在时调用 next", async () => {
    const token = jwt.sign({ userId: "user-1" }, TEST_SECRET, {
      expiresIn: "1h",
    });
    vi.mocked(User.exists).mockResolvedValue({ _id: "mongo-id" } as any);

    const ctx = createContext(`Bearer ${token}`);
    const next = vi.fn();

    await authMiddleware(ctx, next);

    expect(ctx.user).toMatchObject({ userId: "user-1" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("无效 Token 时返回 401", async () => {
    const ctx = createContext("Bearer not-a-valid-jwt");
    const next = vi.fn();

    await authMiddleware(ctx, next);

    expect(ctx.status).toBe(401);
    expect(ctx.body).toMatchObject({
      code: 1002,
      message: "认证失败：无效的Token",
    });
    expect(next).not.toHaveBeenCalled();
  });
});
