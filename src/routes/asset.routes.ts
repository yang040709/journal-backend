import Router from "@koa/router";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import { error, ErrorCodes, paginatedSuccess, success } from "../utils/response";
import { MediaDeleteOrchestrator } from "../service/mediaDeleteOrchestrator.service";
import { listByUser } from "../service/userImageAsset.service";
import { z } from "zod";

const router = new Router({
  prefix: "/assets",
});

router.use(authMiddleware);

const listImagesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  source: z.enum(["note", "cover"]).optional(),
});

/**
 * @swagger
 * /assets/images:
 *   get:
 *     tags:
 *       - 用户资产
 *     summary: 分页获取当前用户上传过的图片记录
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [note, cover]
 *     responses:
 *       200:
 *         description: 成功
 */
router.get("/images", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const query = listImagesQuerySchema.parse(ctx.query);
    const { items, total } = await listByUser(userId, {
      page: query.page,
      limit: query.limit,
      source: query.source,
    });
    paginatedSuccess(
      ctx,
      items,
      total,
      query.page,
      query.limit,
      "获取图片资产成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    console.error("获取图片资产失败:", err);
    error(ctx, "获取图片资产失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @swagger
 * /assets/images/{id}:
 *   delete:
 *     tags:
 *       - 用户资产
 *     summary: 彻底删除用户图片（同步手帐/封面引用，COS 异步入队删除）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 *       404:
 *         description: 记录不存在或无权操作
 */
router.delete("/images/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const id = ctx.params.id || "";
    const result = await MediaDeleteOrchestrator.deleteUserImageAsset(userId, id);
    if (!result) {
      error(ctx, "记录不存在或无权操作", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, result, "图片已删除");
  } catch (err) {
    console.error("移除图片资产失败:", err);
    const msg = err instanceof Error ? err.message : "移除图片资产失败";
    const isBizError = /无法彻底删除|不存在|无权/.test(msg);
    error(
      ctx,
      msg,
      isBizError ? ErrorCodes.PARAM_ERROR : ErrorCodes.INTERNAL_ERROR,
      isBizError ? 400 : 500,
    );
  }
});

export default router;
