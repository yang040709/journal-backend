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
 * @openapi
 * /stats/user:
 *   get:
 *     tags:
 *       - stats
 *     summary: 获取用户统计信息
 *     description: 获取当前用户的手帐本数量与手帐数量
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取用户统计成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /stats/tags:
 *   get:
 *     tags:
 *       - stats
 *     summary: 获取标签统计信息
 *     description: 获取当前用户手帐标签使用次数排行（最多 50 条）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取标签统计成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessArray'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /stats/activity:
 *   get:
 *     tags:
 *       - stats
 *     summary: 获取用户活动时间线
 *     description: 获取当前用户最近的手帐创建与编辑活动记录
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: 返回条数上限
 *     responses:
 *       200:
 *         description: 获取活动时间线成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessArray'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /stats/note-book-usage:
 *   get:
 *     tags:
 *       - stats
 *     summary: 获取手帐本使用统计
 *     description: 获取各手帐本下的手帐数量分布
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取手帐本使用统计成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /stats/overview:
 *   get:
 *     tags:
 *       - stats
 *     summary: 获取统计概览
 *     description: 获取手帐本总数、手帐总数、近 7/30 日新增及最近编辑时间等概览数据
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取统计概览成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /stats/creation-trend:
 *   get:
 *     tags:
 *       - stats
 *     summary: 获取内容创作趋势
 *     description: 按日统计近 7 天或 30 天的手帐创建数量
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: integer
 *           enum: [7, 30]
 *           default: 7
 *         description: 统计天数范围
 *     responses:
 *       200:
 *         description: 获取内容创作趋势成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /stats/tag-quality:
 *   get:
 *     tags:
 *       - stats
 *     summary: 获取标签质量统计
 *     description: 分析标签使用频率、重复度与覆盖率等质量指标
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取标签质量统计成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /stats/notebook-health:
 *   get:
 *     tags:
 *       - stats
 *     summary: 获取手帐本健康度统计
 *     description: 评估各手帐本的活跃度、空本比例等健康度指标
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取手帐本健康度统计成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /stats/image-assets:
 *   get:
 *     tags:
 *       - stats
 *     summary: 获取图片资产统计
 *     description: 统计用户手帐与封面中的图片数量、容量等指标
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取图片资产统计成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /stats/reminder-performance:
 *   get:
 *     tags:
 *       - stats
 *     summary: 获取提醒执行统计
 *     description: 统计提醒的订阅、发送成功与失败情况
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取提醒执行统计成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /stats/template-usage:
 *   get:
 *     tags:
 *       - stats
 *     summary: 获取模板使用统计
 *     description: 统计系统模板与自定义模板的使用次数
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取模板使用统计成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
