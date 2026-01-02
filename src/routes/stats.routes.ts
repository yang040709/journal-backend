import Router from "@koa/router";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import { success, error, ErrorCodes } from "../utils/response";
import { StatsService } from "../service/stats.service";

const router = new Router({
  prefix: "/stats",
});

// 所有路由都需要认证
router.use(authMiddleware);

/**
 * @route GET /stats/user
 * @desc 获取用户统计信息
 */
router.get("/user", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;

    const stats = await StatsService.getUserStats(userId);

    success(ctx, stats, "获取用户统计成功");
  } catch (err) {
    console.error("获取用户统计失败:", err);
    error(ctx, "获取用户统计失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /stats/tags
 * @desc 获取标签统计信息
 */
router.get("/tags", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;

    const tagStats = await StatsService.getTagStats(userId);

    success(ctx, tagStats, "获取标签统计成功");
  } catch (err) {
    console.error("获取标签统计失败:", err);
    error(ctx, "获取标签统计失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /stats/activity
 * @desc 获取用户活动时间线
 */
router.get("/activity", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const limit = ctx.query.limit
      ? Math.min(100, Math.max(1, parseInt(ctx.query.limit as string) || 20))
      : 20;

    const activities = await StatsService.getUserActivityTimeline(
      userId,
      limit
    );

    success(ctx, activities, "获取活动时间线成功");
  } catch (err) {
    console.error("获取活动时间线失败:", err);
    error(ctx, "获取活动时间线失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /stats/note-book-usage
 * @desc 获取手帐本使用统计
 */
router.get("/note-book-usage", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;

    const usageStats = await StatsService.getNoteBookUsageStats(userId);

    success(ctx, usageStats, "获取手帐本使用统计成功");
  } catch (err) {
    console.error("获取手帐本使用统计失败:", err);
    error(ctx, "获取手帐本使用统计失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
