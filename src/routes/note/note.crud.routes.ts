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
import { paginationSchema, createNoteSchema, updateNoteSchema, batchDeleteSchema, recentLimitSchema } from "./note.schemas";
import { ReadingThemeCatalogValidationError } from "../../utils/readingThemeCatalog";

const router = new Router();

/**
 * @openapi
 * /notes:
 *   get:
 *     tags: [note]
 *     summary: 获取手帐列表
 *     description: 获取当前用户的手帐列表，支持分页、排序、筛选和标签过滤
 *     security:
 *       - bearerAuth: []
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
 *           maximum: 100
 *         description: 每页数量
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, title]
 *           default: updatedAt
 *         description: 排序字段
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: 排序方向
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
 *         description: 标签筛选（支持多个标签）
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
 *         description: 获取手帐列表成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Note'
 *                 total:
 *                   type: integer
 *                   description: 总记录数
 *                 page:
 *                   type: integer
 *                   description: 当前页码
 *                 limit:
 *                   type: integer
 *                   description: 每页数量
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const params = paginationSchema.parse(ctx.query);
    const result = await NoteService.getNotes(userId, params);
    paginatedSuccess(
      ctx,
      result.items,
      result.total,
      params.page,
      params.limit,
      "获取手帐列表成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (isGuardrailError(err)) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
    } else {
      logger.error("获取手帐列表失败:", err);
      error(ctx, "获取手帐列表失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @openapi
 * /notes/{id}:
 *   get:
 *     tags: [note]
 *     summary: 获取单个手帐
 *     description: 根据ID获取单个手帐的详细信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐ID
 *     responses:
 *       200:
 *         description: 获取手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Note'
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const note = await NoteService.getNoteById(id, userId);
    if (!note) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }

    success(ctx, note, "获取手帐成功");
  } catch (err) {
    logger.error("获取手帐失败:", err);
    error(ctx, "获取手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /notes:
 *   post:
 *     tags: [note]
 *     summary: 创建手帐
 *     description: 创建一个新的手帐
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - noteBookId
 *               - title
 *               - content
 *             properties:
 *               noteBookId:
 *                 type: string
 *                 description: 手帐本ID
 *                 example: "67a1b2c3d4e5f6a7b8c9d0e1"
 *               title:
 *                 type: string
 *                 description: 手帐标题
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: "今天的心情"
 *               content:
 *                 type: string
 *                 description: 手帐内容
 *                 example: "今天天气很好，心情愉快..."
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 标签列表
 *                 example: ["心情", "日记"]
 *     responses:
 *       200:
 *         description: 创建手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Note'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐本不存在或无权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post("/", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = createNoteSchema.parse(ctx.request.body);

    const note = await NoteService.createNote({
      ...body,
      userId,
    });

    success(ctx, note, "创建手帐成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (err.message === "手帐本不存在或无权访问") {
      error(ctx, err.message, ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
    } else {
      logger.error("创建手帐失败:", err);
      error(ctx, "创建手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @openapi
 * /notes/{id}:
 *   put:
 *     tags: [note]
 *     summary: 更新手帐
 *     description: 根据ID更新手帐信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: 手帐标题
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: "更新后的标题"
 *               content:
 *                 type: string
 *                 description: 手帐内容
 *                 example: "更新后的内容..."
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 标签列表
 *                 example: ["更新", "修改"]
 *               noteBookId:
 *                 type: string
 *                 description: 目标手帐本ID
 *                 example: "67a1b2c3d4e5f6a7b8c9d0e1"
 *               readingStyleKey:
 *                 type: string
 *                 nullable: true
 *                 description: 详情页阅读风格 key；null 表示标准阅读
 *                 enum:
 *                   - journal
 *                   - minimalNordic
 *                   - vintageJournal
 *                   - watercolorSketch
 *                   - dreamyCinematic
 *                   - productMemo
 *                 example: "vintageJournal"
 *               readingThemeId:
 *                 type: string
 *                 nullable: true
 *                 description: 阅读主题色 id（与导出 preset 一致）；null 时使用该风格默认主题
 *                 example: "vintage-rose"
 *     responses:
 *       200:
 *         description: 更新手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Note'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐不存在或目标手帐本不存在
 *       500:
 *         description: 服务器内部错误
 */
router.put("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;
    const body = updateNoteSchema.parse(ctx.request.body);

    const note = await NoteService.updateNote(id, userId, body);
    if (!note) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }

    success(ctx, note, "更新手帐成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (err instanceof NotePinLimitExceededError) {
      error(ctx, err.message, ErrorCodes.NOTE_PIN_LIMIT_EXCEEDED, 400);
    } else if (err instanceof ReadingThemeCatalogValidationError) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
    } else if (err instanceof Error && err.message === "目标手帐本不存在或无权访问") {
      error(ctx, err.message, ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
    } else {
      logger.error("更新手帐失败:", err);
      error(ctx, "更新手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @openapi
 * /notes/{id}:
 *   delete:
 *     tags: [note]
 *     summary: 删除手帐
 *     description: 根据ID删除手帐
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐ID
 *     responses:
 *       200:
 *         description: 删除手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐不存在
 *       500:
 *         description: 服务器内部错误
 */
router.delete("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const deleted = await NoteService.deleteNote(id, userId);
    if (!deleted) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }

    success(ctx, { deleted: true }, "已移入废纸篓");
  } catch (err) {
    logger.error("删除手帐失败:", err);
    error(ctx, "删除手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /notes/batch-delete:
 *   post:
 *     tags: [note]
 *     summary: 批量删除手帐
 *     description: 批量删除多个手帐
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - noteIds
 *             properties:
 *               noteIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 手帐ID列表
 *                 example: ["67a1b2c3d4e5f6a7b8c9d0e1", "67a1b2c3d4e5f6a7b8c9d0e2"]
 *     responses:
 *       200:
 *         description: 批量删除手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deletedCount:
 *                   type: integer
 *                   description: 成功删除的数量
 *                   example: 2
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post("/batch-delete", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = batchDeleteSchema.parse(ctx.request.body);

    const deletedCount = await NoteService.batchDeleteNotes(
      body.noteIds,
      userId,
    );

    success(ctx, { deletedCount }, `已移入废纸篓 ${deletedCount} 条手帐`);
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      logger.error("批量删除手帐失败:", err);
      error(ctx, "批量删除手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @openapi
 * /notes/recent:
 *   get:
 *     tags: [note]
 *     summary: 获取最近更新的手帐
 *     description: 获取当前用户最近更新的手帐列表
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: 返回数量限制
 *     responses:
 *       200:
 *         description: 获取最近手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Note'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/recent", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const limit = recentLimitSchema.parse(ctx.query.limit);
    const notes = await NoteService.getRecentNotes(userId, limit);
    success(ctx, notes, "获取最近手帐成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      logger.error("获取最近手帐失败:", err);
      error(ctx, "获取最近手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

export default router;
