import { describe, expect, it, vi } from "vitest";
import { staticFilesMiddleware } from "../../../src/middlewares/staticFiles.middleware";

function makeCtx(urlPath: string) {
  return {
    path: urlPath,
    status: 200,
    type: "",
    body: undefined as unknown,
    set: vi.fn(),
  } as any;
}

describe("unit: staticFilesMiddleware", () => {
  it("非 /static/ 前缀放行 next", async () => {
    const ctx = makeCtx("/api/x");
    const next = vi.fn();
    await staticFilesMiddleware(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  it("非法相对路径返回 400", async () => {
    const ctx = makeCtx("/static/../secret");
    const next = vi.fn();
    await staticFilesMiddleware(ctx, next);
    expect(ctx.status).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("空相对路径返回 400", async () => {
    const ctx = makeCtx("/static/");
    const next = vi.fn();
    await staticFilesMiddleware(ctx, next);
    expect(ctx.status).toBe(400);
  });

  it("文件不存在时交给 next", async () => {
    const ctx = makeCtx("/static/__missing_ut__.svg");
    const next = vi.fn();
    await staticFilesMiddleware(ctx, next);
    expect(next).toHaveBeenCalled();
  });
});
