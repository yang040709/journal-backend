import { describe, expect, it, vi } from "vitest";
import {
  AppError,
  AuthError,
  errorMiddleware,
  NotFoundError,
  ParamError,
  PermissionError,
} from "../../../src/middlewares/error.middleware";

vi.mock("../../../src/utils/logger", () => ({
  logError: vi.fn(),
}));

function makeCtx(partial: Record<string, unknown> = {}) {
  return {
    status: 404,
    body: undefined,
    url: "/x",
    request: { headers: {}, method: "GET", url: "/x", ip: "127.0.0.1" },
    ip: "127.0.0.1",
    state: {},
    set: vi.fn(),
    get: vi.fn(() => ""),
    ...partial,
  } as any;
}


describe("unit: errorMiddleware", () => {
  it("路由未匹配时写 404", async () => {
    const ctx = makeCtx();
    await errorMiddleware(ctx, async () => undefined);
    expect(ctx.status).toBe(404);
    expect(ctx.body?.code).toBeDefined();
  });

  it("按错误类型映射状态码", async () => {
    const cases: Array<[Error, number]> = [
      [Object.assign(new SyntaxError("bad json"), { status: undefined }), 400],
      [Object.assign(new Error("val"), { name: "ValidationError" }), 400],
      [Object.assign(new Error("cast"), { name: "CastError" }), 400],
      [Object.assign(new Error("dup"), { code: 11000 }), 409],
      [Object.assign(new Error("client"), { status: 400, code: 40001 }), 400],
      [new Error("boom"), 500],
    ];
    for (const [err, status] of cases) {
      const ctx = makeCtx({ status: 200, body: { ok: 1 } });
      await errorMiddleware(ctx, async () => {
        throw err;
      });
      expect(ctx.status).toBe(status);
    }
  });

  it("自定义错误类可用", () => {
    expect(new ParamError().status).toBe(400);
    expect(new AuthError().status).toBe(401);
    expect(new PermissionError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new AppError("x").name).toBe("AppError");
  });
});
