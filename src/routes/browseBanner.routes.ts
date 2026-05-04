import Router from "@koa/router";
import { success, error, ErrorCodes } from "../utils/response";
import { BrowseBannerService } from "../service/browseBanner.service";

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

export default router;
