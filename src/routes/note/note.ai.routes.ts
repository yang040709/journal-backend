import Router from "@koa/router";
import { z } from "zod";
import { AuthContext } from "../../middlewares/auth.middleware";
import { success, error, ErrorCodes } from "../../utils/response";
import { AiNoteService } from "../../service/aiNote.service";
import { AiStyleService } from "../../service/aiStyle.service";
import logger from "../../utils/logger";
import { aiGenerateSchema } from "./note.schemas";

const router = new Router();

/**
 * @openapi
 * /notes/ai/styles:
 *   get:
 *     tags: [note]
 *     summary: 获取 AI 写手帐风格列表
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessArray'
 *       '401':
 *         description: 未授权
 */
router.get("/ai/styles", async (ctx: AuthContext) => {
  try {
    const data = await AiStyleService.listEnabledForClient();
    success(ctx, data, "ok");
  } catch (err) {
    logger.error("获取 AI 风格列表失败:", err);
    error(ctx, "获取灵感风格失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /notes/ai/generate:
 *   post:
 *     tags: [note]
 *     summary: AI 写手帐
 *     description: 使用 DeepSeek 生成、改写或续写手帐正文；每用户每日有次数限制
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mode
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [generate, rewrite, continue]
 *                 description: generate=从零生成；rewrite=改写润色；continue=接续写作
 *               title:
 *                 type: string
 *                 description: 手帐标题（mode=generate 时必填）
 *               content:
 *                 type: string
 *                 description: 当前正文（rewrite/continue 时必填）
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               hint:
 *                 type: string
 *                 description: 用户补充说明或改写/续写方向
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     text:
 *                       type: string
 *                     remainingToday:
 *                       type: integer
 *       400:
 *         description: 参数错误或前置条件不满足
 *       401:
 *         description: 未授权
 *       429:
 *         description: 今日灵感次数已用完
 *       500:
 *         description: 服务不可用或内部错误
 */
router.post("/ai/generate", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = aiGenerateSchema.parse(ctx.request.body);
    const result = await AiNoteService.generate({
      userId,
      mode: body.mode,
      title: body.title,
      content: body.content,
      tags: body.tags,
      hint: body.hint,
      styleKey: body.styleKey,
    });
    success(ctx, result, "ok");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    const message = err instanceof Error ? err.message : "灵感生成失败";
    const code =
      err instanceof Error && (err as Error & { code?: string }).code === "AI_DAILY_LIMIT_EXCEEDED"
        ? ErrorCodes.AI_DAILY_LIMIT_EXCEEDED
        : undefined;
    if (code === ErrorCodes.AI_DAILY_LIMIT_EXCEEDED) {
      error(ctx, message, ErrorCodes.AI_DAILY_LIMIT_EXCEEDED, 429);
      return;
    }
    if (message === "AI service not configured") {
      error(ctx, "灵感服务暂不可用", ErrorCodes.INTERNAL_ERROR, 500);
      return;
    }
    if (
      message === "请先填写手帐标题" ||
      message === "请先填写手帐正文"
    ) {
      error(ctx, message, ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    logger.error("AI 写手帐失败:", err);
    error(ctx, message || "灵感生成失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /notes/ai/quota:
 *   get:
 *     tags: [note]
 *     summary: 查询今日 AI 写手帐剩余次数
 *     description: 不扣减次数，仅查询当日剩余可用次数（含 0）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     remainingToday:
 *                       type: integer
 *       401:
 *         description: 未授权
 *       500:
 *         description: 服务器内部错误
 */
router.get("/ai/quota", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const result = await AiNoteService.getQuotaSummary(userId);
    success(ctx, result, "ok");
  } catch (err) {
    logger.error("查询 AI 额度失败:", err);
    error(ctx, "查询灵感额度失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
