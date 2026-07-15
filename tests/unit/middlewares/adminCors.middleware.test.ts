import { afterEach, describe, expect, it, vi } from "vitest";
import { adminCorsMiddleware } from "../../../src/middlewares/adminCors.middleware";

function makeCtx(origin: string, method = "GET") {
  const headers: Record<string, string> = {};
  return {
    method,
    get: vi.fn((k: string) => (k === "Origin" ? origin : "")),
    set: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    status: 200,
    headers,
  } as any;
}

describe("unit: adminCorsMiddleware", () => {
  const prevOrigin = process.env.ADMIN_CORS_ORIGIN;
  const prevEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevOrigin === undefined) delete process.env.ADMIN_CORS_ORIGIN;
    else process.env.ADMIN_CORS_ORIGIN = prevOrigin;
    process.env.NODE_ENV = prevEnv;
  });

  it("显式白名单命中 / 未命中", async () => {
    process.env.ADMIN_CORS_ORIGIN = "https://admin.example.com";
    const ok = makeCtx("https://admin.example.com");
    const next = vi.fn();
    await adminCorsMiddleware(ok, next);
    expect(ok.set).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      "https://admin.example.com",
    );
    expect(next).toHaveBeenCalled();

    const denied = makeCtx("https://evil.example.com");
    await adminCorsMiddleware(denied, next);
    expect(denied.set).not.toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      expect.anything(),
    );
  });

  it("开发环境放行 localhost；OPTIONS 返回 204", async () => {
    delete process.env.ADMIN_CORS_ORIGIN;
    process.env.NODE_ENV = "development";
    const ctx = makeCtx("http://localhost:5173", "OPTIONS");
    const next = vi.fn();
    await adminCorsMiddleware(ctx, next);
    expect(ctx.status).toBe(204);
    expect(next).not.toHaveBeenCalled();
  });
});
