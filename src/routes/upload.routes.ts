import Router from "@koa/router";
import { z } from "zod";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import {
  UploadAdRewardDailyLimitExceededError,
  UploadAdRewardInvalidError,
  UploadDailyLimitExceededError,
  UploadService,
} from "../service/upload.service";
import { success, error, ErrorCodes } from "../utils/response";
import { logger } from "../utils/logger";

const router = new Router({
  prefix: "/api/upload",
});

router.use(authMiddleware);

const createCosStsSchema = z
  .object({
    biz: z.enum(["note", "cover"]),
    fileName: z.string().min(1, "文件名不能为空").max(255, "文件名过长"),
    fileType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    fileSize: z.number().int().positive("文件大小必须大于0"),
    withThumb: z.boolean().optional(),
  })
  .refine((data) => !data.withThumb || data.biz === "note" || data.biz === "cover", {
    message: "仅手帐配图或封面支持缩略图凭证",
    path: ["withThumb"],
  });

const adRewardSchema = z.object({
  adProvider: z.string().trim().min(1, "广告平台不能为空").max(100, "广告平台字段过长"),
  adUnitId: z.string().trim().min(1, "广告位不能为空").max(200, "广告位字段过长"),
  rewardToken: z.string().trim().min(1, "奖励凭证不能为空").max(255, "奖励凭证字段过长"),
  requestId: z.string().trim().max(255, "请求ID字段过长").optional(),
});

/**
 * @swagger
 * /api/upload/cos/sts:
 *   post:
 *     tags:
 *       - 文件上传
 *     summary: 获取 COS 上传临时凭证
 *     description: 仅签发上传凭证，不接收图片二进制内容
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - biz
 *               - fileName
 *               - fileType
 *               - fileSize
 *             properties:
 *               biz:
 *                 type: string
 *                 enum: [note, cover]
 *               fileName:
 *                 type: string
 *               fileType:
 *                 type: string
 *                 enum: [image/jpeg, image/png, image/webp]
 *               fileSize:
 *                 type: integer
 *                 example: 1024000
 *               withThumb:
 *                 type: boolean
 *                 description: biz=note 或 cover 时有效；返回 thumbKey/thumbFileUrl，STS 允许写入主图与 -mini.jpg
 *     responses:
 *       200:
 *         description: 获取临时凭证成功
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post("/cos/sts", async (ctx: AuthContext) => {
  const requestId = ctx.state.requestId || "unknown";
  const userId = ctx.user!.userId;

  try {
    const body = createCosStsSchema.parse(ctx.request.body);
    const data = await UploadService.createCosStsCredential({
      userId,
      biz: body.biz,
      fileName: body.fileName,
      fileType: body.fileType,
      fileSize: body.fileSize,
      withThumb: body.withThumb,
    });

    logger.info("签发COS临时凭证成功", {
      requestId,
      userId,
      key: data.key,
      thumbKey: data.thumbKey,
      fileType: body.fileType,
      fileSize: body.fileSize,
    });

    success(ctx, data, "获取上传凭证成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (err instanceof UploadDailyLimitExceededError) {
      logger.warn("签发COS临时凭证触发上传额度限制", {
        requestId,
        userId,
        details: err.details,
      });
      error(ctx, err.message, ErrorCodes.UPLOAD_DAILY_LIMIT_EXCEEDED, 400, {
        dateKey: err.details.dateKey,
        limit: err.details.totalLimit,
        used: err.details.usedCount,
        remaining: err.details.remaining,
      });
      return;
    }

    const message = err instanceof Error ? err.message : "获取上传凭证失败";
    const isBizError = /不支持|超过限制|环境变量缺失|额度已用完/.test(message);

    logger.error("签发COS临时凭证失败", {
      requestId,
      userId,
      error: message,
    });

    error(
      ctx,
      isBizError ? message : "获取上传凭证失败",
      isBizError ? ErrorCodes.PARAM_ERROR : ErrorCodes.INTERNAL_ERROR,
      isBizError ? 400 : 500,
    );
  }
});

router.get("/quota", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  const requestId = ctx.state.requestId || "unknown";

  try {
    const data = await UploadService.getUploadQuotaSummary(userId);
    success(ctx, data, "获取上传额度成功");
  } catch (err) {
    const message = err instanceof Error ? err.message : "获取上传额度失败";
    logger.error("获取上传额度失败", {
      requestId,
      userId,
      error: message,
    });
    error(ctx, "获取上传额度失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.post("/quota/ad-reward", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  const requestId = ctx.state.requestId || "unknown";

  try {
    const body = adRewardSchema.parse(ctx.request.body);
    const result = await UploadService.grantUploadAdReward(userId, {
      adProvider: body.adProvider,
      adUnitId: body.adUnitId,
      rewardToken: body.rewardToken,
      requestId: body.requestId || requestId,
    });

    success(
      ctx,
      {
        rewardQuota: result.rewardQuota,
        extraQuotaTotal: result.extraQuotaTotal,
        duplicated: result.duplicated,
      },
      result.duplicated ? "奖励已发放，无需重复领取" : "领取奖励成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }

    if (err instanceof UploadAdRewardInvalidError) {
      error(ctx, err.message, ErrorCodes.UPLOAD_AD_REWARD_INVALID, 400);
      return;
    }

    if (err instanceof UploadAdRewardDailyLimitExceededError) {
      error(ctx, err.message, ErrorCodes.UPLOAD_AD_REWARD_DAILY_LIMIT_EXCEEDED, 400);
      return;
    }

    const message = err instanceof Error ? err.message : "领取奖励失败";
    logger.error("领取上传额度奖励失败", {
      requestId,
      userId,
      error: message,
    });
    error(ctx, "领取奖励失败，请稍后重试", ErrorCodes.UPLOAD_AD_REWARD_PROVIDER_ERROR, 500);
  }
});

export default router;
