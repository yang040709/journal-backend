import Router from "@koa/router";
import { z } from "zod";
import { AuthContext } from "../../middlewares/auth.middleware";
import {
  success,
  error,
  paginatedSuccess,
  ErrorCodes,
} from "../../utils/response";
import { NoteService, NotePinLimitExceededError } from "../../service/note.service";
import logger from "../../utils/logger";
import { isGuardrailError } from "./note.shared";
import { searchSchema, searchLegacySchema } from "./note.schemas";

const router = new Router();

/**
 * @openapi
 * /notes/search/page:
 *   get:
 *     tags: [note]
 *     summary: 搜索手帐（分页，新版客户端）
 *     description: 根据关键词搜索手帐，返回分页结构（与 GET /notes 一致）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 搜索关键词
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
 *           maximum: 100
 *         description: 每页数量
 *       - in: query
 *         name: noteBookId
 *         schema:
 *           type: string
 *         description: 手帐本ID筛选
 *       - in: query
 *         name: tags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: 标签筛选
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: integer
 *         description: 开始时间戳（毫秒）
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: integer
 *         description: 结束时间戳（毫秒）
 *     responses:
 *       200:
 *         description: 搜索手帐成功（分页）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Note'
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/search/page", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const params = searchSchema.parse(ctx.query);
    const result = await NoteService.searchNotes(userId, params);

    paginatedSuccess(
      ctx,
      result.items,
      result.total,
      params.page,
      params.limit,
      "搜索手帐成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (isGuardrailError(err)) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
    } else {
      logger.error("搜索手帐失败:", err);
      error(ctx, "搜索手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @openapi
 * /notes/search:
 *   get:
 *     tags: [note]
 *     summary: 搜索手帐（兼容旧版客户端）
 *     description: data 为手帐数组（非分页对象）；单次最多返回 100 条，详见 limit
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 100
 *         description: 本次最多返回条数
 *       - in: query
 *         name: noteBookId
 *         schema:
 *           type: string
 *         description: 手帐本ID筛选
 *       - in: query
 *         name: tags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: 标签筛选
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: integer
 *         description: 开始时间戳（毫秒）
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: integer
 *         description: 结束时间戳（毫秒）
 *     responses:
 *       200:
 *         description: 搜索手帐成功（数组）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Note'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/search", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const legacy = searchLegacySchema.parse(ctx.query);
    const result = await NoteService.searchNotes(userId, {
      q: legacy.q,
      page: 1,
      limit: legacy.limit,
      noteBookId: legacy.noteBookId,
      tags: legacy.tags,
      startTime: legacy.startTime,
      endTime: legacy.endTime,
    });

    success(ctx, result.items, "搜索手帐成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (isGuardrailError(err)) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
    } else {
      logger.error("搜索手帐失败:", err);
      error(ctx, "搜索手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

export default router;
