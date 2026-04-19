import Router from "@koa/router";
import { z } from "zod";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import { success, error, ErrorCodes } from "../utils/response";
import User from "../model/User";
import { NoteExportSettingsService } from "../service/noteExportSettings.service";
import { getQuotaDateContext } from "../utils/dateKey";
import { getZonedWeekRangeUtc } from "../utils/weekBounds";
import NoteExportLog from "../model/NoteExportLog";
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
    const freeUsed = await NoteExportLog.countDocuments({
      userId,
      source: "weekly_free",
      createdAt: { $gte: weekStartUtc, $lt: weekEndExclusiveUtc },
    });
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
