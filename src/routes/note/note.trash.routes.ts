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
import { paginationSchema, restoreNoteSchema } from "./note.schemas";

const router = new Router();

/**
 * @openapi
 * /notes/trash:
 *   get:
 *     tags: [note]
 *     summary: 获取废纸篓手帐列表
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
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, title]
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessPaginatedNoteList'
 *       '401':
 *         description: 未授权
 */
router.get("/trash", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const params = paginationSchema.parse(ctx.query);
    const result = await NoteService.getTrashNotes(userId, params);
    paginatedSuccess(
      ctx,
      result.items,
      result.total,
      params.page,
      params.limit,
      "获取废纸篓手帐成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (isGuardrailError(err)) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    logger.error("获取废纸篓手帐失败:", err);
    error(ctx, "获取废纸篓手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /notes/{id}/trash-detail:
 *   get:
 *     tags: [note]
 *     summary: 获取废纸篓手帐详情
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessNote'
 *       '404':
 *         description: 手帐不存在
 */
router.get("/:id/trash-detail", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;
    const note = await NoteService.getTrashNoteById(id, userId);
    if (!note) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }
    success(ctx, note, "获取废纸篓手帐成功");
  } catch (err) {
    logger.error("获取废纸篓手帐失败:", err);
    error(ctx, "获取废纸篓手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /notes/{id}/restore:
 *   post:
 *     tags: [note]
 *     summary: 从废纸篓恢复手帐
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetNoteBookId:
 *                 type: string
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '404':
 *         description: 手帐或手帐本不存在
 */
router.post("/:id/restore", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;
    const body = restoreNoteSchema.parse(ctx.request.body || {});
    const restored = await NoteService.restoreNote(id, userId, body.targetNoteBookId);
    if (!restored) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }
    success(
      ctx,
      {
        note: restored.note,
        restoredToNoteBookId: restored.restoredToNoteBookId,
        restoredToNoteBookTitle: restored.restoredToNoteBookTitle,
      },
      "恢复手帐成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (err instanceof Error && err.message === "目标手帐本不存在或已删除") {
      error(ctx, err.message, ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
      return;
    }
    if (
      err instanceof Error &&
      (err as Error & { code?: string }).code === "NOTEBOOK_LIMIT_EXCEEDED"
    ) {
      error(ctx, err.message, ErrorCodes.NOTEBOOK_LIMIT_EXCEEDED, 400);
      return;
    }
    logger.error("恢复手帐失败:", err);
    error(ctx, "恢复手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /notes/{id}/purge:
 *   delete:
 *     tags: [note]
 *     summary: 彻底删除手帐
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '404':
 *         description: 手帐不存在
 */
router.delete("/:id/purge", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;
    const deleted = await NoteService.purgeNote(id, userId);
    if (!deleted) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }
    success(ctx, { deleted: true }, "彻底删除成功");
  } catch (err) {
    logger.error("彻底删除手帐失败:", err);
    error(ctx, "彻底删除手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
