import { describe, expect, it } from "vitest";
import { Context } from "koa";
import { error, paginatedSuccess, success } from "../../../src/utils/response";

function createContext(requestId = "front_test_123"): Context {
  return {
    state: { requestId },
    status: 200,
    body: undefined,
  } as Context;
}

describe("response requestId", () => {
  it("success 响应 body 含 requestId", () => {
    const ctx = createContext("front_success_id");
    success(ctx, { ok: true }, "ok");

    expect(ctx.body).toMatchObject({
      code: 0,
      message: "ok",
      data: { ok: true },
      requestId: "front_success_id",
    });
  });

  it("error 响应 body 含 requestId", () => {
    const ctx = createContext("front_error_id");
    error(ctx, "参数错误", 1001, 400);

    expect(ctx.status).toBe(400);
    expect(ctx.body).toMatchObject({
      code: 1001,
      message: "参数错误",
      requestId: "front_error_id",
    });
  });

  it("paginatedSuccess 响应 body 含 requestId", () => {
    const ctx = createContext("front_page_id");
    paginatedSuccess(ctx, [{ id: 1 }], 1, 1, 10);

    expect(ctx.body).toMatchObject({
      code: 0,
      requestId: "front_page_id",
      data: {
        items: [{ id: 1 }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    });
  });

  it("无 ctx.state.requestId 时回退 unknown", () => {
    const ctx = { state: {}, status: 200, body: undefined } as Context;
    error(ctx, "失败", 9999, 500);

    expect(ctx.body).toMatchObject({
      requestId: "unknown",
    });
  });
});
