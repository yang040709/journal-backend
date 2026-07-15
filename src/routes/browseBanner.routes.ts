import Router from "@koa/router";
import { success, error, ErrorCodes } from "../utils/response";
import { BrowseBannerService } from "../service/browseBanner.service";
import { optionalAuthMiddleware, type AuthContext } from "../middlewares/auth.middleware";

const router = new Router({
  prefix: "/browse-banners",
});

/**
 * @openapi
 * /browse-banners:
 *   get:
 *     tags:
 *       - browseBanner
 *     summary: 获取浏览 Tab 轮播列表
 *     description: 获取浏览 Tab 顶部轮播图列表，公开接口无需登录
 *     security: []
 *     responses:
 *       200:
 *         description: 获取轮播列表成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessObject'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/BrowseBanner'
 *       500:
 *         description: 服务器内部错误
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

/**
 * @openapi
 * /browse-banners/{id}/click:
 *   post:
 *     tags:
 *       - browseBanner
 *     summary: 记录轮播点击
 *     description: 记录轮播图点击 PV/UV；无需登录，可选 Bearer Token 用于 UV 去重
 *     security:
 *       - {}
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 轮播 ID
 *     responses:
 *       200:
 *         description: 记录点击成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessObject'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         ok:
 *                           type: boolean
 *                           example: true
 *       400:
 *         description: 参数错误或轮播不存在
 *       500:
 *         description: 服务器内部错误
 */
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
