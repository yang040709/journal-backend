import Router from "@koa/router";
import { success, error } from "../../utils/response";
import { ScreenshotFixtureService } from "../../service/screenshotFixture.service";

const router = new Router({
  prefix: "/dev/screenshot",
});

function readScreenshotSecret(): string {
  return String(process.env.SCREENSHOT_SEED_SECRET || "").trim();
}

function isAuthorized(ctx: { get: (name: string) => string | undefined }): boolean {
  const expected = readScreenshotSecret();
  if (!expected) return false;
  const provided = String(ctx.get("X-Screenshot-Secret") || "").trim();
  return provided.length > 0 && provided === expected;
}

/**
 * @openapi
 * /dev/screenshot/seed:
 *   post:
 *     tags: [dev]
 *     summary: 创建截图专用测试数据（仅 development）
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-Screenshot-Secret
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: seed 成功，返回 token 与 fixture ID
 *       403:
 *         description: 未启用或密钥错误
 */
router.post("/seed", async (ctx) => {
  if (!ScreenshotFixtureService.isEnabled()) {
    error(ctx, "截图 seed 未启用：需 NODE_ENV=development 且配置 SCREENSHOT_SEED_SECRET", 9999, 403);
    return;
  }
  if (!isAuthorized(ctx)) {
    error(ctx, "X-Screenshot-Secret 无效", 9999, 403);
    return;
  }

  try {
    const body = (ctx.request.body || {}) as { reset?: boolean };
    const reset = body.reset !== false;
    const result = await ScreenshotFixtureService.seed({ reset });
    success(ctx, result, result.reused ? "复用已有截图 fixture" : "截图 fixture 已就绪");
  } catch (err) {
    error(
      ctx,
      err instanceof Error ? err.message : "截图 seed 失败",
      9999,
      500,
    );
  }
});

export default router;
