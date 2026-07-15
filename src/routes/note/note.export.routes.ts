import Router from "@koa/router";
import { z } from "zod";
import { AuthContext } from "../../middlewares/auth.middleware";
import { success, error, ErrorCodes } from "../../utils/response";
import {
  NoteExportService,
  NoteExportQuotaError,
} from "../../service/noteExport.service";
import { AlertMetricService } from "../../service/alertMetric.service";
import logger from "../../utils/logger";
import {
  noteExportPreviewQuerySchema,
  noteExportRunBodySchema,
} from "./note.schemas";

const router = new Router();

/**
 * @openapi
 * /notes/export-preview:
 *   get:
 *     tags: [noteExport]
 *     summary: 手帐导出预览
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: noteBookId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: integer
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [updatedAt, createdAt]
 *           default: updatedAt
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 */
router.get("/export-preview", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const q = noteExportPreviewQuerySchema.parse(ctx.query);
    const data = await NoteExportService.preview(
      userId,
      q.noteBookId,
      q.startTime,
      q.endTime,
      q.sort,
    );
    success(ctx, data, "ok");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (err instanceof NoteExportQuotaError) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    logger.error("export-preview 失败:", err);
    error(ctx, "预览失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /notes/export-run:
 *   post:
 *     tags: [noteExport]
 *     summary: 执行手帐导出
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
 *             properties:
 *               noteBookId:
 *                 type: string
 *               startTime:
 *                 type: integer
 *               endTime:
 *                 type: integer
 *               sort:
 *                 type: string
 *                 enum: [updatedAt, createdAt]
 *               clientPlatform:
 *                 type: string
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 */
router.post("/export-run", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = noteExportRunBodySchema.parse(ctx.request.body);
    const data = await NoteExportService.run(userId, {
      noteBookId: body.noteBookId,
      startTime: body.startTime,
      endTime: body.endTime,
      sort: body.sort,
      clientPlatform: body.clientPlatform,
    });
    void AlertMetricService.recordOperation("export_run", { success: true });
    success(ctx, data, "ok");
  } catch (err) {
    if (err instanceof z.ZodError) {
      void AlertMetricService.recordOperation("export_run", { success: false });
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (err instanceof NoteExportQuotaError) {
      void AlertMetricService.recordOperation("export_run", { success: false });
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    void AlertMetricService.recordOperation("export_run", { success: false });
    logger.error("export-run 失败:", err);
    error(ctx, "导出失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
