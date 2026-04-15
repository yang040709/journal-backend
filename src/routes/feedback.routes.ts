import Router from "@koa/router";
import { z } from "zod";
import { authMiddleware, AuthContext, optionalAuthMiddleware } from "../middlewares/auth.middleware";
import { ErrorCodes, error, success } from "../utils/response";
import { FeedbackRateLimitError, FeedbackService } from "../service/feedback.service";

const router = new Router({
  prefix: "/feedbacks",
});

router.get("/weekly-first-status", optionalAuthMiddleware, async (ctx: AuthContext) => {
  try {
    const userId = ctx.user?.userId;
    if (!userId) {
      success(
        ctx,
        { granted: false, rewardPoints: 200, weekStartDateKey: null, weekEndAt: null },
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
    error(ctx, e instanceof Error ? e.message : "反馈提交失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

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
