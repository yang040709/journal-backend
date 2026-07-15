import Router from "@koa/router";
import { z } from "zod";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import { success, error, ErrorCodes } from "../utils/response";
import User from "../model/User";
import { NoteExportSettingsService } from "../service/noteExportSettings.service";
import { getQuotaDateContext } from "../utils/dateKey";
import { getZonedWeekRangeUtc } from "../utils/weekBounds";
import { NoteExportService } from "../service/noteExport.service";
import {
  PointsService,
  PointsExchangeInvalidError,
  PointsInsufficientError,
} from "../service/points.service";

const router = new Router({ prefix: "/user" });

router.use(authMiddleware);

const exchangeBodySchema = z.object({
  times: z.coerce.number().int().min(1).max(20).optional().default(1),
});

/**
 * @openapi
 * /user/export-quota:
 *   get:
 *     tags:
 *       - noteExport
 *     summary: 获取导出额度与配置
 *     description: 获取当前用户的导出配额、积分、本周免费次数及导出相关系统配置
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取导出额度成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/export-quota", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    await User.updateMany(
      { userId, $or: [{ exportExtraCredits: { $exists: false } }, { exportExtraCredits: null }] },
      { $set: { exportExtraCredits: 0 } },
    );
    const settings = await NoteExportSettingsService.get();
    const { timezone } = getQuotaDateContext();
    const { weekStartUtc, weekEndExclusiveUtc } = getZonedWeekRangeUtc(new Date(), timezone);
    const weekKey = NoteExportService.weekKeyFromStart(weekStartUtc);
    const freeUsed = await NoteExportService.ensureWeeklyUsageFromLogs(
      userId,
      weekKey,
      weekStartUtc,
      weekEndExclusiveUtc,
    );
    const u = await User.findOne({ userId }).select("exportExtraCredits points").lean();
    const exportExtraCredits = Math.max(
      0,
      Math.floor(Number((u as { exportExtraCredits?: number })?.exportExtraCredits ?? 0)),
    );
    const points = Math.max(0, Math.floor(Number((u as { points?: number })?.points ?? 0)));
    const weeklyFreeRemaining = Math.max(0, settings.exportWeeklyFreeCount - freeUsed);
    success(ctx, {
      settings: {
        exportPointsPerExtra: settings.exportPointsPerExtra,
        exportWeeklyFreeCount: settings.exportWeeklyFreeCount,
        exportMaxNotesPerFile: settings.exportMaxNotesPerFile,
        exportDefaultWindowDays: settings.exportDefaultWindowDays,
        exportMaxRangeDays: settings.exportMaxRangeDays,
      },
      weeklyFreeUsed: freeUsed,
      weeklyFreeRemaining,
      exportExtraCredits,
      points,
      weekResetsAfter: weekEndExclusiveUtc.toISOString(),
    });
  } catch (e) {
    error(
      ctx,
      e instanceof Error ? e.message : "加载失败",
      ErrorCodes.INTERNAL_ERROR,
      500,
    );
  }
});

/**
 * @openapi
 * /user/export-quota/exchange:
 *   post:
 *     tags:
 *       - noteExport
 *     summary: 积分兑换额外导出次数
 *     description: 使用积分兑换额外手帐导出次数
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               times:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 20
 *                 default: 1
 *                 description: 兑换次数
 *     responses:
 *       200:
 *         description: 兑换成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       400:
 *         description: 参数验证失败、积分不足或兑换无效
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post("/export-quota/exchange", async (ctx: AuthContext) => {
  const userId = ctx.user!.userId;
  try {
    const body = exchangeBodySchema.parse(ctx.request.body);
    const data = await PointsService.exchangeNoteExport(userId, body.times);
    success(ctx, data, "兑换成功");
  } catch (e) {
    if (e instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (e instanceof PointsInsufficientError) {
      error(ctx, e.message, ErrorCodes.POINTS_INSUFFICIENT, 400);
      return;
    }
    if (e instanceof PointsExchangeInvalidError) {
      error(ctx, e.message, ErrorCodes.POINTS_EXCHANGE_INVALID, 400);
      return;
    }
    error(ctx, "兑换失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
