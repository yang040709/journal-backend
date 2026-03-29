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

/**
 * @route GET /stats/overview
 * @desc 获取统计概览
 */
router.get("/overview", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const overview = await StatsService.getOverviewStats(userId);
    success(ctx, overview, "获取统计概览成功");
  } catch (err) {
    console.error("获取统计概览失败:", err);
    error(ctx, "获取统计概览失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /stats/creation-trend
 * @desc 获取内容创作趋势
 */
router.get("/creation-trend", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const rangeQuery = Number(ctx.query.range || 7);
    const range = rangeQuery === 30 ? 30 : 7;
    const trend = await StatsService.getCreationTrendStats(userId, range);
    success(ctx, trend, "获取内容创作趋势成功");
  } catch (err) {
    console.error("获取内容创作趋势失败:", err);
    error(ctx, "获取内容创作趋势失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /stats/tag-quality
 * @desc 获取标签质量统计
 */
router.get("/tag-quality", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const tagQuality = await StatsService.getTagQualityStats(userId);
    success(ctx, tagQuality, "获取标签质量统计成功");
  } catch (err) {
    console.error("获取标签质量统计失败:", err);
    error(ctx, "获取标签质量统计失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /stats/notebook-health
 * @desc 获取手帐本健康度统计
 */
router.get("/notebook-health", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const notebookHealth = await StatsService.getNotebookHealthStats(userId);
    success(ctx, notebookHealth, "获取手帐本健康度统计成功");
  } catch (err) {
    console.error("获取手帐本健康度统计失败:", err);
    error(ctx, "获取手帐本健康度统计失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /stats/image-assets
 * @desc 获取图片资产统计
 */
router.get("/image-assets", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const imageAssets = await StatsService.getImageAssetStats(userId);
    success(ctx, imageAssets, "获取图片资产统计成功");
  } catch (err) {
    console.error("获取图片资产统计失败:", err);
    error(ctx, "获取图片资产统计失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /stats/reminder-performance
 * @desc 获取提醒执行统计
 */
router.get("/reminder-performance", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const reminderPerformance = await StatsService.getReminderPerformanceStats(userId);
    success(ctx, reminderPerformance, "获取提醒执行统计成功");
  } catch (err) {
    console.error("获取提醒执行统计失败:", err);
    error(ctx, "获取提醒执行统计失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /stats/template-usage
 * @desc 获取模板使用统计
 */
router.get("/template-usage", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const templateUsage = await StatsService.getTemplateUsageStats(userId);
    success(ctx, templateUsage, "获取模板使用统计成功");
  } catch (err) {
    console.error("获取模板使用统计失败:", err);
    error(ctx, "获取模板使用统计失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
