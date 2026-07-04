import { describe, expect, it, vi } from "vitest";
import { requestIdMiddleware } from "../../../src/middlewares/requestId.middleware";
import { Context, Next } from "koa";

function createContext(headers: Record<string, string> = {}): Context {
  const responseHeaders: Record<string, string> = {};
  return {
    get: (name: string) => headers[name.toLowerCase()] || headers[name] || "",
    set: (name: string, value: string) => {
      responseHeaders[name] = value;
    },
    state: {},
    _responseHeaders: responseHeaders,
  } as unknown as Context & { _responseHeaders: Record<string, string> };
}

describe("requestIdMiddleware", () => {
  it("复用请求头 X-Request-Id", async () => {
    const ctx = createContext({ "X-Request-Id": "front_123_abc" });
    const next: Next = vi.fn().mockResolvedValue(undefined);

    await requestIdMiddleware(ctx, next);

    expect(ctx.state.requestId).toBe("front_123_abc");
    expect((ctx as any)._responseHeaders["X-Request-Id"]).toBe("front_123_abc");
    expect(next).toHaveBeenCalledOnce();
  });

  it("无请求头时生成 req_ 前缀 ID", async () => {
    const ctx = createContext();
    const next: Next = vi.fn().mockResolvedValue(undefined);

    await requestIdMiddleware(ctx, next);

    expect(String(ctx.state.requestId)).toMatch(/^req_/);
    expect((ctx as any)._responseHeaders["X-Request-Id"]).toBe(ctx.state.requestId);
  });
});
