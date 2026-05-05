import Router from "@koa/router";
import { success, error, ErrorCodes } from "../utils/response";
import { BrowseBannerService } from "../service/browseBanner.service";
import { optionalAuthMiddleware, type AuthContext } from "../middlewares/auth.middleware";

const router = new Router({
  prefix: "/browse-banners",
});

/**
 * 浏览 Tab 顶部轮播（公开，无需用户登录）
 */
router.get("/", async (ctx) => {
  try {
    const items = await BrowseBannerService.listPublic();
    success(ctx, { items }, "ok");
  } catch (e) {
    error(
      ctx,
      e instanceof Error ? e.message : "加载失败",
      ErrorCodes.INTERNAL_ERROR,
      500,
    );
  }
});

router.post("/:id/click", optionalAuthMiddleware, async (ctx: AuthContext) => {
  try {
    const bannerId = String(ctx.params?.id || "").trim();
    await BrowseBannerService.recordClick({
      bannerId,
      userId: ctx.user?.userId,
    });
    success(ctx, { ok: true }, "ok");
  } catch (e) {
    error(
      ctx,
      e instanceof Error ? e.message : "记录点击失败",
      ErrorCodes.PARAM_ERROR,
      400,
    );
  }
});

export default router;
