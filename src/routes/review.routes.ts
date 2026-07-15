import Router from "@koa/router";
import { z } from "zod";
import { ErrorCodes, error, success } from "../utils/response";
import { UserReviewService } from "../service/userReview.service";

const MAX_PAGE_DEPTH = (() => {
  const raw = String(process.env.QUERY_PAGE_DEPTH_LIMIT ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : 50_000;
})();

const router = new Router({
  prefix: "/reviews",
});

const publicListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(10),
  })
  .refine((val) => val.page * val.pageSize <= MAX_PAGE_DEPTH, {
    message: `分页深度超过限制（page*pageSize <= ${MAX_PAGE_DEPTH}）`,
    path: ["page"],
  });

/**
 * @openapi
 * /reviews:
 *   get:
 *     tags:
 *       - review
 *     summary: 获取用户评价列表
 *     description: 公开接口，分页返回已上架的用户评价
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: 每页数量
 *     responses:
 *       200:
 *         description: 获取评价列表成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessGeneric'
 *       400:
 *         description: 参数验证失败或分页深度超限
 *       500:
 *         description: 服务器内部错误
 */
router.get("/", async (ctx) => {
  try {
    const query = publicListQuerySchema.parse(ctx.query);
    const data = await UserReviewService.listPublic(query);
    success(ctx, data, "ok");
  } catch (e) {
    if (e instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
