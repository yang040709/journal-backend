import Router from "@koa/router";
import { z } from "zod";
import { ErrorCodes, error, paginatedSuccess, success } from "../utils/response";
import { AnnouncementService } from "../service/announcement.service";

const router = new Router({
  prefix: "/announcements",
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

/**
 * @openapi
 * /announcements:
 *   get:
 *     tags:
 *       - announcement
 *     summary: 获取公告列表
 *     description: 分页获取已发布的公告列表
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: 每页数量
 *     responses:
 *       200:
 *         description: 获取公告列表成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessGeneric'
 *       400:
 *         description: 参数验证失败
 *       500:
 *         description: 服务器内部错误
 */
router.get("/", async (ctx) => {
  try {
    const q = listQuerySchema.parse(ctx.query);
    const data = await AnnouncementService.listPublic(q);
    paginatedSuccess(ctx, data.items, data.total, data.page, data.limit, "ok");
  } catch (e) {
    if (e instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /announcements/{id}:
 *   get:
 *     tags:
 *       - announcement
 *     summary: 获取公告详情
 *     description: 获取已发布公告详情并递增浏览量
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 公告 ID
 *     responses:
 *       200:
 *         description: 获取公告详情成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessGeneric'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Announcement'
 *       404:
 *         description: 公告不存在或已下线
 *       500:
 *         description: 服务器内部错误
 */
router.get("/:id", async (ctx) => {
  try {
    const row = await AnnouncementService.getPublishedDetailAndIncreaseView(String(ctx.params.id || ""));
    if (!row) {
      error(ctx, "公告不存在或已下线", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, row, "ok");
  } catch (e) {
    error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
