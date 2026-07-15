import Router from "@koa/router";
import { z } from "zod";
import { authMiddleware, AuthContext, optionalAuthMiddleware } from "../middlewares/auth.middleware";
import { ErrorCodes, error, success } from "../utils/response";
import { FeedbackRateLimitError, FeedbackService } from "../service/feedback.service";
import logger from "../utils/logger";

const router = new Router({
  prefix: "/feedbacks",
});

/**
 * @openapi
 * /feedbacks/weekly-first-status:
 *   get:
 *     tags:
 *       - feedback
 *     summary: 获取本周首条反馈奖励状态
 *     description: |
 *       可选认证接口（security 为空）。未携带 Bearer Token 时返回公开奖励规则与 granted=false；
 *       携带有效 bearerAuth 时返回当前用户本周是否已获得首条反馈奖励。
 *     security: []
 *     responses:
 *       200:
 *         description: 获取状态成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       500:
 *         description: 服务器内部错误
 */
router.get("/weekly-first-status", optionalAuthMiddleware, async (ctx: AuthContext) => {
  try {
    const userId = ctx.user?.userId;
    if (!userId) {
      const feedbackRewards = await FeedbackService.getFeedbackRewardRulesPublic();
      success(
        ctx,
        {
          granted: false,
          rewardPoints: feedbackRewards.weeklyFirstSubmit,
          weekStartDateKey: null,
          weekEndAt: null,
          feedbackRewards,
        },
        "ok",
      );
      return;
    }
    const data = await FeedbackService.getWeeklyFirstRewardStatus(userId);
    success(ctx, data, "ok");
  } catch (e) {
    error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.use(authMiddleware);

const createFeedbackSchema = z.object({
  type: z.enum(["bug", "rant", "demand", "praise"]),
  content: z.string().trim().min(1, "反馈内容不能为空").max(4000, "反馈内容过长"),
  contact: z.string().trim().max(120, "联系方式过长").optional(),
  images: z.array(z.string().trim().url("截图 URL 格式不正确")).max(9).optional().default([]),
  clientMeta: z.record(z.string(), z.unknown()).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
});

/**
 * @openapi
 * /feedbacks:
 *   post:
 *     tags:
 *       - feedback
 *     summary: 提交用户反馈
 *     description: 提交 bug、吐槽、需求或表扬类反馈，可附带截图
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - content
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [bug, rant, demand, praise]
 *                 description: 反馈类型
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 4000
 *                 description: 反馈正文
 *               contact:
 *                 type: string
 *                 maxLength: 120
 *                 description: 联系方式（可选）
 *               images:
 *                 type: array
 *                 maxItems: 9
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: 截图 URL 列表
 *               clientMeta:
 *                 type: object
 *                 additionalProperties: true
 *                 description: 客户端元信息（可选）
 *     responses:
 *       200:
 *         description: 反馈提交成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       400:
 *         description: 参数验证失败或提交过于频繁（4301）
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post("/", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  try {
    const body = createFeedbackSchema.parse(ctx.request.body);
    const data = await FeedbackService.createFeedback({
      userId,
      type: body.type,
      content: body.content,
      contact: body.contact,
      images: body.images,
      clientMeta: body.clientMeta,
    });
    success(ctx, data, "反馈提交成功");
  } catch (e) {
    if (e instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (e instanceof FeedbackRateLimitError) {
      error(ctx, e.message, ErrorCodes.FEEDBACK_RATE_LIMIT, 400);
      return;
    }
    logger.error("反馈提交失败", e);
    error(ctx, e instanceof Error ? e.message : "反馈提交失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /feedbacks/my:
 *   get:
 *     tags:
 *       - feedback
 *     summary: 获取我的反馈列表
 *     description: 分页返回当前用户提交的反馈记录
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
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: 每页数量
 *     responses:
 *       200:
 *         description: 获取反馈列表成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessGeneric'
 *       400:
 *         description: 参数验证失败或分页深度超限
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/my", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  try {
    const query = listQuerySchema.parse(ctx.query);
    const data = await FeedbackService.getMyFeedbackList(userId, query);
    success(ctx, data, "ok");
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
 * /feedbacks/unread-summary:
 *   get:
 *     tags:
 *       - feedback
 *     summary: 获取未读反馈回复汇总
 *     description: 返回未读回复数量及最新一条未读摘要
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取未读汇总成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/unread-summary", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  try {
    const data = await FeedbackService.getUnreadReplySummary(userId);
    success(ctx, data, "ok");
  } catch (e) {
    error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /feedbacks/mark-all-replies-read:
 *   post:
 *     tags:
 *       - feedback
 *     summary: 标记全部反馈回复为已读
 *     description: 将当前用户所有未读反馈回复一次性标记为已读
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 操作成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post("/mark-all-replies-read", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  try {
    const data = await FeedbackService.markAllRepliesRead(userId);
    success(ctx, data, "ok");
  } catch (e) {
    error(ctx, e instanceof Error ? e.message : "操作失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /feedbacks/{id}/mark-reply-read:
 *   post:
 *     tags:
 *       - feedback
 *     summary: 标记单条反馈回复为已读
 *     description: 将指定反馈的官方回复标记为已读
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 反馈 ID
 *     responses:
 *       200:
 *         description: 操作成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       400:
 *         description: 该反馈暂无回复
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 反馈不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/:id/mark-reply-read", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  try {
    const data = await FeedbackService.markReplyRead(userId, String(ctx.params.id || ""));
    success(ctx, data, "ok");
  } catch (e) {
    if (e instanceof Error && e.message === "反馈不存在") {
      error(ctx, "反馈不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    if (e instanceof Error && e.message === "该反馈暂无回复") {
      error(ctx, e.message, ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    error(ctx, e instanceof Error ? e.message : "操作失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /feedbacks/{id}:
 *   get:
 *     tags:
 *       - feedback
 *     summary: 获取我的反馈详情
 *     description: 返回指定反馈的完整详情（含官方回复）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 反馈 ID
 *     responses:
 *       200:
 *         description: 获取反馈详情成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 反馈不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/:id", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  const detail = await FeedbackService.getMyFeedbackDetail(userId, String(ctx.params.id || ""));
  if (!detail) {
    error(ctx, "反馈不存在", ErrorCodes.NOT_FOUND, 404);
    return;
  }
  success(ctx, detail, "ok");
});

export default router;
