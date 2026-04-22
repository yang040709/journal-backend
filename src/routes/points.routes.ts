import Router from "@koa/router";
import { z } from "zod";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import { success, error, ErrorCodes } from "../utils/response";
import { logger } from "../utils/logger";
import {
  PointsService,
  PointsAdRewardDailyLimitExceededError,
  PointsAdRewardInvalidError,
  PointsExchangeDisabledError,
  PointsExchangeInvalidError,
  PointsInsufficientError,
} from "../service/points.service";
import {
  CampaignAlreadyClaimedError,
  CampaignEndedError,
  CampaignNotFoundError,
  CampaignNotPublishedError,
  CampaignNotStartedError,
  CampaignSoldOutError,
  PointsCampaignService,
} from "../service/pointsCampaign.service";
import { pointsCampaignClaimRateLimit } from "../middlewares/pointsCampaignRateLimit.middleware";

const router = new Router({
  prefix: "/points",
});

router.use(authMiddleware);

const adRewardSchema = z.object({
  adProvider: z.string().trim().min(1, "广告平台不能为空").max(100, "广告平台字段过长"),
  adUnitId: z.string().trim().min(1, "广告位不能为空").max(200, "广告位字段过长"),
  rewardToken: z.string().trim().min(1, "奖励凭证不能为空").max(255, "奖励凭证字段过长"),
  requestId: z.string().trim().max(255, "请求ID字段过长").optional(),
});

const exchangeSchema = z.object({
  kind: z.enum(["upload", "ai"]),
});

const transactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
  flowType: z.enum(["all", "income", "expense"]).optional().default("all"),
});

const campaignIdSchema = z.object({
  id: z.string().trim().min(1),
});

router.get("/summary", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  const requestId = ctx.state.requestId || "unknown";
  try {
    const data = await PointsService.getSummary(userId);
    success(ctx, data, "ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : "获取积分信息失败";
    logger.error("获取积分摘要失败", { requestId, userId, error: message });
    error(ctx, "获取积分信息失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.post("/ad-reward", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  const requestId = ctx.state.requestId || "unknown";
  try {
    const body = adRewardSchema.parse(ctx.request.body);
    const result = await PointsService.grantAdReward(userId, {
      adProvider: body.adProvider,
      adUnitId: body.adUnitId,
      rewardToken: body.rewardToken,
      requestId: body.requestId || requestId,
    });
    success(
      ctx,
      {
        rewardPoints: result.rewardPoints,
        points: result.points,
        duplicated: result.duplicated,
      },
      result.duplicated ? "奖励已发放，无需重复领取" : "领取奖励成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (err instanceof PointsAdRewardInvalidError) {
      error(ctx, err.message, ErrorCodes.POINTS_AD_REWARD_INVALID, 400);
      return;
    }
    if (err instanceof PointsAdRewardDailyLimitExceededError) {
      error(ctx, err.message, ErrorCodes.POINTS_AD_REWARD_DAILY_LIMIT_EXCEEDED, 400, err.details);
      return;
    }
    const message = err instanceof Error ? err.message : "领取奖励失败";
    logger.error("领取积分广告奖励失败", { requestId, userId, error: message });
    error(ctx, "领取奖励失败，请稍后重试", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.post("/exchange", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  const requestId = ctx.state.requestId || "unknown";
  try {
    const body = exchangeSchema.parse(ctx.request.body);
    const data = await PointsService.exchange(userId, body.kind, { requestId });
    success(ctx, data, "兑换成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (err instanceof PointsExchangeDisabledError) {
      error(ctx, err.message, ErrorCodes.POINTS_EXCHANGE_DISABLED, 400);
      return;
    }
    if (err instanceof PointsInsufficientError) {
      error(ctx, err.message, ErrorCodes.POINTS_INSUFFICIENT, 400);
      return;
    }
    if (err instanceof PointsExchangeInvalidError) {
      error(ctx, err.message, ErrorCodes.POINTS_EXCHANGE_INVALID, 400);
      return;
    }
    const message = err instanceof Error ? err.message : "兑换失败";
    logger.error("积分兑换失败", { requestId, userId, error: message });
    error(ctx, "兑换失败，请稍后重试", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.get("/transactions", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  const requestId = ctx.state.requestId || "unknown";
  try {
    const query = transactionsQuerySchema.parse(ctx.query);
    const data = await PointsService.listUserTransactions(userId, query);
    success(ctx, data, "ok");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    const message = err instanceof Error ? err.message : "获取积分流水失败";
    logger.error("获取积分流水失败", { requestId, userId, error: message });
    error(ctx, "获取积分流水失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.get("/campaigns/:id", async (ctx: AuthContext) => {
  try {
    const p = campaignIdSchema.parse(ctx.params);
    const data = await PointsCampaignService.getCampaignForUser(p.id, ctx.user!.userId);
    success(ctx, data, "ok");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (err instanceof CampaignNotFoundError) {
      error(ctx, "活动不存在", ErrorCodes.CAMPAIGN_NOT_FOUND, 404);
      return;
    }
    logger.error("获取活动详情失败", {
      requestId: ctx.state.requestId || "unknown",
      userId: ctx.user!.userId,
      error: err instanceof Error ? err.message : "unknown",
    });
    error(ctx, "获取活动详情失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.post("/campaigns/:id/claim", pointsCampaignClaimRateLimit, async (ctx: AuthContext) => {
  try {
    const p = campaignIdSchema.parse(ctx.params);
    const data = await PointsCampaignService.claimCampaign(p.id, ctx.user!.userId, {
      ip: String(ctx.ip || ctx.request.ip || ""),
      ua: String(ctx.get("user-agent") || ""),
      requestId: String(ctx.state.requestId || ""),
    });
    success(ctx, data, "领取成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (err instanceof CampaignNotFoundError) {
      error(ctx, "活动不存在", ErrorCodes.CAMPAIGN_NOT_FOUND, 404);
      return;
    }
    if (err instanceof CampaignNotPublishedError) {
      error(ctx, "活动未发布", ErrorCodes.CAMPAIGN_NOT_PUBLISHED, 400);
      return;
    }
    if (err instanceof CampaignNotStartedError) {
      error(ctx, "活动未开始", ErrorCodes.CAMPAIGN_NOT_STARTED, 400);
      return;
    }
    if (err instanceof CampaignEndedError) {
      error(ctx, "活动已结束", ErrorCodes.CAMPAIGN_ENDED, 400);
      return;
    }
    if (err instanceof CampaignSoldOutError) {
      error(ctx, "活动已领完", ErrorCodes.CAMPAIGN_SOLD_OUT, 400);
      return;
    }
    if (err instanceof CampaignAlreadyClaimedError) {
      error(ctx, "您已领取过该活动", ErrorCodes.CAMPAIGN_ALREADY_CLAIMED, 400);
      return;
    }
    logger.error("领取活动积分失败", {
      requestId: ctx.state.requestId || "unknown",
      userId: ctx.user!.userId,
      error: err instanceof Error ? err.message : "unknown",
    });
    error(ctx, "领取失败，请稍后重试", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
