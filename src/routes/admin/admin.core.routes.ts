import Router from "@koa/router";
import { z } from "zod";
import {
  adminAuthMiddleware,
  requireAdminPage,
  requireSuperAdmin,
} from "../../middlewares/adminAuth.middleware";
import {
  ADMIN_PAGE_NOTES,
  ADMIN_PAGE_NOTEBOOKS,
  ADMIN_PAGE_USERS,
  ADMIN_PAGE_TEMPLATES,
  ADMIN_PAGE_REMINDERS,
  ADMIN_PAGE_NOTE_TAGS,
  ADMIN_PAGE_AI_STYLES,
  ADMIN_PAGE_GALLERY,
  ADMIN_PAGE_FEEDBACKS,
  ADMIN_PAGE_ANNOUNCEMENTS,
  ADMIN_PAGE_POINTS_CAMPAIGNS,
  ADMIN_PAGE_REVIEWS,
} from "../../constant/adminPages";
import {
  success,
  error,
  paginatedSuccess,
  ErrorCodes,
} from "../../utils/response";
import { AdminAccountService } from "../../service/adminAccount.service";
import { AdminNoteService } from "../../service/adminNote.service";
import { AdminNoteBookService } from "../../service/adminNoteBook.service";
import { AdminNotebookMigrationService } from "../../service/adminNotebookMigration.service";
import { AdminUserService } from "../../service/adminUser.service";
import { AdminTemplateService } from "../../service/adminTemplate.service";
import { AdminReminderService } from "../../service/adminReminder.service";
import { AdminUserCoverService } from "../../service/adminUserCover.service";
import { AdminStatsService } from "../../service/adminStats.service";
import { AdminDisplayPreferenceStatsService } from "../../service/adminDisplayPreferenceStats.service";
import { AdminClientEventStatsService } from "../../service/adminClientEventStats.service";
import { ClientEventConfigService } from "../../service/clientEventConfig.service";
import { AdminReadingThemeStatsService } from "../../service/adminReadingThemeStats.service";
import {
  AdminOperationsReportService,
  MAX_RANGE_DAYS,
} from "../../service/adminOperationsReport.service";
import { AdminQuotaService } from "../../service/adminQuota.service";
import { AiConsumptionLogService } from "../../service/aiConsumptionLog.service";
import { CoverService } from "../../service/cover.service";
import { BrowseBannerService } from "../../service/browseBanner.service";
import User from "../../model/User";
import PointsRuleChangeLog from "../../model/PointsRuleChangeLog";
import { PointsService } from "../../service/points.service";
import { listAll, listByUser } from "../../service/userImageAsset.service";
import { NotePresetTagService } from "../../service/notePresetTag.service";
import { UserNoteCustomTagService } from "../../service/userNoteCustomTag.service";
import { QuotaBaseLimitsService } from "../../service/quotaBaseLimits.service";
import { NoteExportSettingsService } from "../../service/noteExportSettings.service";
import { ReadingThemeCatalogConfigService } from "../../service/readingThemeCatalogConfig.service";
import { ReadingThemeCatalogValidationError } from "../../utils/readingThemeCatalog";
import { readingThemeCatalogPutSchema } from "../../schemas/readingTheme.schema";
import NoteExportLog from "../../model/NoteExportLog";
import { AiStyleService } from "../../service/aiStyle.service";
import { AiNoteService } from "../../service/aiNote.service";
import { UserPurgeService } from "../../service/userPurge.service";
import {
  MigrationBusinessError,
  UserMigrationService,
} from "../../service/userMigration.service";
import {
  InitialUserNotebookConfigService,
  MAX_INITIAL_NOTEBOOK_TEMPLATES,
} from "../../service/initialUserNotebookConfig.service";
import { InitialUserNoteSeedConfigService } from "../../service/initialUserNoteSeedConfig.service";
import { AdminGalleryService } from "../../service/adminGallery.service";
import { FeedbackService } from "../../service/feedback.service";
import { FeedbackQuickReplyService } from "../../service/feedbackQuickReply.service";
import { AnnouncementService } from "../../service/announcement.service";
import {
  CampaignNotFoundError,
  PointsCampaignService,
} from "../../service/pointsCampaign.service";
import { AlertMetricService } from "../../service/alertMetric.service";
import { AlertRuleService } from "../../service/alertRule.service";
import { WechatMpNotifyService } from "../../service/wechatMpNotify.service";
import {
  formatAlertRulePatch,
  formatAlertToggleSummary,
  hasAlertRulePatchChange,
} from "../../utils/adminMpNotifyFormat";
import AlertEvent from "../../model/AlertEvent";
import { UserReviewService } from "../../service/userReview.service";
import * as adminSchemas from "./admin.schemas";
import { ADMIN_EXPORT_LIMIT, daySpanInclusive } from "./admin.shared";

const {
  loginSchema,
  paginationSchema,
  noteListQuerySchema,
  riskNoteListQuerySchema,
  userListQuerySchema,
  userActivityQuerySchema,
  activityListQuerySchema,
  quotaDailyListQuerySchema,
  aiConsumptionLogListQuerySchema,
  operationsReportQuerySchema,
  clientEventStatsQuerySchema,
  clientEventConfigUpdateSchema,
  readingThemeStatsQuerySchema,
  alertRuleUpdateSchema,
  alertRuleToggleSchema,
  alertEventListQuerySchema,
  alertEventAckSchema,
  adRewardLogListQuerySchema,
  createNoteSchema,
  updateNoteSchema,
  createNoteBookSchema,
  updateNoteBookSchema,
  importNotebookJsonSchema,
  createUserSchema,
  updateUserSchema,
  userMigrationPrecheckSchema,
  userMigrationExecuteSchema,
  adminPointsRulesPutSchema,
  feedbackListQuerySchema,
  feedbackQuickReplyItemSchema,
  feedbackQuickRepliesBodySchema,
  feedbackReviewRewardPointsSchema,
  feedbackReviewBodySchema,
  batchIdsSchema,
  feedbackBatchReviewBodySchema,
  feedbackUserReplyBodySchema,
  feedbackExportQuerySchema,
  feedbackNextQuerySchema,
  announcementListQuerySchema,
  announcementCreateBodySchema,
  announcementUpdateBodySchema,
  adminQuotaBaseLimitsPutSchema,
  adminExportSettingsPutSchema,
  noteExportLogQuerySchema,
  createAdminSchema,
  updateAdminSchema,
  templateFieldsSchema,
  adminCreateTemplateSchema,
  adminUpdateTemplateSchema,
  adminSystemTemplateBodySchema,
  adminUpdateSystemTemplateSchema,
  systemTemplateBatchStatusBodySchema,
  systemTemplateExportQuerySchema,
  templateListQuerySchema,
  reminderListQuerySchema,
  adminUpdateReminderSchema,
  adminQuickCoversBodySchema,
  adminSystemCoversPutSchema,
  adminBrowseBannersPutSchema,
  adminNotePresetTagsPutSchema,
  adminInitialNotebooksPutSchema,
  adminInitialNotesPutSchema,
  adminCustomCoverBodySchema,
  adminGalleryCosStsSchema,
  adminGalleryRecordSchema,
  adminGalleryListQuerySchema,
  adminImageAssetsListQuerySchema,
  aiStyleModePromptsSchema,
  aiStyleCreateSchema,
  aiStyleUpdateSchema,
  aiStyleEnableSchema,
  aiStylePreviewSchema,
  batchNoteIdsBodySchema,
  batchTagsBodySchema,
  batchShareBodySchema,
  pointsRuleLogQuerySchema,
  pointsTransactionsQuerySchema,
  pointsCampaignCreateSchema,
  pointsCampaignUpdateSchema,
  pointsCampaignListQuerySchema,
  adminReviewListQuerySchema,
  adminReviewCreateSchema,
  adminReviewUpdateSchema,
} = adminSchemas;


const router = new Router();

/**
 * @openapi
 * /admin/auth/me:
 *   get:
 *     tags: [adminCore]
 *     summary: 获取当前管理员信息
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessAdminProfile'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/auth/me", async (ctx) => {
  const a = ctx.state.admin!;
  success(ctx, AdminAccountService.toPublicAdmin(a));
});

/**
 * @openapi
 * /admin/stats/overview:
 *   get:
 *     tags: [adminCore]
 *     summary: 全站运营概览（仅超级管理员）
 *     description: 需超级管理员权限 requireSuperAdmin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/stats/overview",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await AdminStatsService.getOverview();
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/stats/display-preferences:
 *   get:
 *     tags: [adminCore]
 *     summary: 显示偏好设置统计（仅超级管理员）
 *     description: 统计各显示偏好项的设置人数、变更次数与选项分布
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 */
router.get(
  "/stats/display-preferences",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await AdminDisplayPreferenceStatsService.getReport();
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/stats/client-events:
 *   get:
 *     tags: [adminCore]
 *     summary: 客户端埋点统计（仅超级管理员）
 *     description: 按事件类型、action、日期与平台聚合 client_events
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 90
 *           default: 7
 *       - in: query
 *         name: eventName
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 */
router.get(
  "/stats/client-events",
  requireSuperAdmin(),
  async (ctx) => {
    const q = clientEventStatsQuerySchema.parse(ctx.query);
    const data = await AdminClientEventStatsService.getReport({
      days: q.days,
      eventName: q.eventName,
    });
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/client-event-config:
 *   get:
 *     tags: [adminCore]
 *     summary: 客户端埋点开关配置（仅超级管理员）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *       '401':
 *         description: 未授权
 */
router.get(
  "/client-event-config",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await ClientEventConfigService.getForAdmin();
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/client-event-config:
 *   put:
 *     tags: [adminCore]
 *     summary: 更新客户端埋点开关配置（仅超级管理员）
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled, events]
 *             properties:
 *               enabled:
 *                 type: boolean
 *               events:
 *                 type: object
 *     responses:
 *       '200':
 *         description: 成功
 *       '400':
 *         description: 参数错误
 *       '401':
 *         description: 未授权
 */
router.put(
  "/client-event-config",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const parsed = clientEventConfigUpdateSchema.safeParse(ctx.request.body);
      if (!parsed.success) {
        error(ctx, "参数错误", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      const data = await ClientEventConfigService.setForAdmin(parsed.data);
      success(ctx, data);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "更新失败",
        ErrorCodes.INTERNAL_ERROR,
        500,
      );
    }
  },
);

/**
 * @openapi
 * /admin/stats/reading-themes:
 *   get:
 *     tags: [adminCore]
 *     summary: 阅读主题使用统计（仅超级管理员）
 *     description: 统计全局默认分布与阅读主题变更次数、去重用户数
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 90
 *           default: 30
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 */
router.get(
  "/stats/reading-themes",
  requireSuperAdmin(),
  async (ctx) => {
    const q = readingThemeStatsQuerySchema.parse(ctx.query);
    const data = await AdminReadingThemeStatsService.getReport({ days: q.days });
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/stats/operations-report:
 *   get:
 *     tags: [adminCore]
 *     summary: 运营报表（时间范围，仅超级管理员）
 *     description: 需超级管理员权限 requireSuperAdmin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/stats/operations-report",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const q = operationsReportQuerySchema.parse(ctx.query);
      const data = await AdminOperationsReportService.getReport(
        q.startDate,
        q.endDate,
      );
      success(ctx, data);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "参数错误",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/alerts/rules:
 *   get:
 *     tags: [adminCore]
 *     summary: 告警规则列表
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessAdminAlertRuleList'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/alerts/rules", requireSuperAdmin(), async (ctx) => {
  try {
    const rules = await AlertRuleService.listRules();
    success(ctx, rules);
  } catch (e) {
    error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /admin/alerts/rules/{ruleKey}:
 *   put:
 *     tags: [adminCore]
 *     summary: 更新告警规则
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessAdminAlertRule'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/alerts/rules/:ruleKey", requireSuperAdmin(), async (ctx) => {
  try {
    const ruleKey = String(ctx.params.ruleKey || "");
    const prev = await AlertRuleService.getRuleByKey(ruleKey);
    const body = alertRuleUpdateSchema.parse(ctx.request.body || {});
    const rule = await AlertRuleService.updateRuleByKey(ruleKey, body);
    if (!rule) {
      error(ctx, "规则不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    if (hasAlertRulePatchChange(prev, body)) {
      void WechatMpNotifyService.notifyHighRiskOp({
        opType: "告警阈值修改",
        operator: ctx.state.admin?.username || "unknown",
        target: ruleKey,
        summary: formatAlertRulePatch(prev, body),
      });
    }
    success(ctx, rule);
  } catch (e) {
    if (e instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    error(ctx, e instanceof Error ? e.message : "保存失败", ErrorCodes.PARAM_ERROR, 400);
  }
});

/**
 * @openapi
 * /admin/alerts/rules/{ruleKey}/toggle:
 *   post:
 *     tags: [adminCore]
 *     summary: 启用/禁用告警规则
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessAdminAlertRule'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/alerts/rules/:ruleKey/toggle", requireSuperAdmin(), async (ctx) => {
  try {
    const ruleKey = String(ctx.params.ruleKey || "");
    const body = alertRuleToggleSchema.parse(ctx.request.body || {});
    const rule = await AlertRuleService.toggleRule(ruleKey, body.enabled);
    if (!rule) {
      error(ctx, "规则不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    void WechatMpNotifyService.notifyHighRiskOp({
      opType: body.enabled ? "告警规则开启" : "告警规则关闭",
      operator: ctx.state.admin?.username || "unknown",
      target: ruleKey,
      summary: formatAlertToggleSummary(body.enabled),
    });
    success(ctx, rule);
  } catch (e) {
    if (e instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    error(ctx, e instanceof Error ? e.message : "操作失败", ErrorCodes.PARAM_ERROR, 400);
  }
});

/**
 * @openapi
 * /admin/alerts/events:
 *   get:
 *     tags: [adminCore]
 *     summary: 告警事件列表（分页）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessPaginatedAdminAlertEventList'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/alerts/events", requireSuperAdmin(), async (ctx) => {
  try {
    const q = alertEventListQuerySchema.parse(ctx.query || {});
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.severity) filter.severity = q.severity;
    if (q.ruleKey?.trim()) filter.ruleKey = q.ruleKey.trim();
    const skip = (q.page - 1) * q.limit;
    const [rows, total] = await Promise.all([
      AlertEvent.find(filter).sort({ triggeredAt: -1 }).skip(skip).limit(q.limit).lean(),
      AlertEvent.countDocuments(filter),
    ]);
    paginatedSuccess(ctx, rows as unknown as Record<string, unknown>[], total, q.page, q.limit);
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
 * /admin/alerts/events/{eventId}:
 *   get:
 *     tags: [adminCore]
 *     summary: 告警事件详情
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessAdminAlertEvent'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/alerts/events/:eventId", requireSuperAdmin(), async (ctx) => {
  const eventId = String(ctx.params.eventId || "").trim();
  if (!eventId) {
    error(ctx, "eventId 不能为空", ErrorCodes.PARAM_ERROR, 400);
    return;
  }
  const row = await AlertEvent.findOne({ eventId }).lean();
  if (!row) {
    error(ctx, "告警事件不存在", ErrorCodes.NOT_FOUND, 404);
    return;
  }
  success(ctx, row);
});

/**
 * @openapi
 * /admin/alerts/events/{eventId}/ack:
 *   post:
 *     tags: [adminCore]
 *     summary: 确认告警事件
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessAdminAlertEvent'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/alerts/events/:eventId/ack", requireSuperAdmin(), async (ctx) => {
  try {
    const body = alertEventAckSchema.parse(ctx.request.body || {});
    const eventId = String(ctx.params.eventId || "").trim();
    const row = await AlertEvent.findOneAndUpdate(
      { eventId },
      {
        $set: {
          status: "acknowledged",
          ackBy: ctx.state.admin?.username || "",
          ackAt: new Date(),
          ackRemark: body.remark || "",
        },
      },
      { new: true },
    );
    if (!row) {
      error(ctx, "告警事件不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, row);
  } catch (e) {
    if (e instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    error(ctx, e instanceof Error ? e.message : "处理失败", ErrorCodes.PARAM_ERROR, 400);
  }
});

/**
 * @openapi
 * /admin/alerts/events/{eventId}/resolve:
 *   post:
 *     tags: [adminCore]
 *     summary: 解决告警事件
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessAdminAlertEvent'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/alerts/events/:eventId/resolve", requireSuperAdmin(), async (ctx) => {
  const eventId = String(ctx.params.eventId || "").trim();
  const row = await AlertEvent.findOneAndUpdate(
    { eventId },
    {
      $set: {
        status: "resolved",
        resolvedAt: new Date(),
      },
    },
    { new: true },
  );
  if (!row) {
    error(ctx, "告警事件不存在", ErrorCodes.NOT_FOUND, 404);
    return;
  }
  success(ctx, row);
});

/**
 * @openapi
 * /admin/alerts/metrics/overview:
 *   get:
 *     tags: [adminCore]
 *     summary: 告警指标概览
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/alerts/metrics/overview", requireSuperAdmin(), async (ctx) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [todayTriggered, unresolvedCount, p1OpenCount, acknowledgedCount] = await Promise.all([
    AlertEvent.countDocuments({ triggeredAt: { $gte: startOfDay } }),
    AlertEvent.countDocuments({ status: { $in: ["open", "acknowledged"] } }),
    AlertEvent.countDocuments({ status: "open", severity: "P1" }),
    AlertEvent.countDocuments({ status: "acknowledged" }),
  ]);
  success(ctx, {
    todayTriggered,
    unresolvedCount,
    p1OpenCount,
    acknowledgedCount,
  });
});

/**
 * @openapi
 * /admin/quota/ai-daily:
 *   get:
 *     tags: [adminCore]
 *     summary: AI 额度日统计（分页）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/quota/ai-daily",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const q = quotaDailyListQuerySchema.parse(ctx.query);
      const { items, total, page, limit } =
        await AdminQuotaService.listAiUsageDaily(q);
      paginatedSuccess(ctx, items, total, page, limit);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "参数错误",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/quota/upload-daily:
 *   get:
 *     tags: [adminCore]
 *     summary: 上传额度日统计（分页）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/quota/upload-daily",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const q = quotaDailyListQuerySchema.parse(ctx.query);
      const { items, total, page, limit } =
        await AdminQuotaService.listUploadQuotaDaily(q);
      paginatedSuccess(ctx, items, total, page, limit);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "参数错误",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/quota/ad-reward-logs:
 *   get:
 *     tags: [adminCore]
 *     summary: 激励视频奖励日志（分页）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/quota/ad-reward-logs",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const q = adRewardLogListQuerySchema.parse(ctx.query);
      const { items, total, page, limit } =
        await AdminQuotaService.listAdRewardLogs(q);
      paginatedSuccess(ctx, items, total, page, limit);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "参数错误",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/system/covers:
 *   get:
 *     tags: [adminCore]
 *     summary: 系统封面配置
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/system/covers",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await CoverService.getSystemCoversForAdmin();
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/system/covers:
 *   put:
 *     tags: [adminCore]
 *     summary: 更新系统封面
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  "/system/covers",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = adminSystemCoversPutSchema.parse(ctx.request.body);
      const r = await CoverService.setSystemCovers(body.coverUrls);
      success(ctx, {
        coverUrls: r.coverUrls,
        updatedAt: r.updatedAt.toISOString(),
      });
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "保存失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/system/browse-banners:
 *   get:
 *     tags: [adminCore]
 *     summary: 浏览页 Banner 配置
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/system/browse-banners",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await BrowseBannerService.getForAdmin();
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/system/browse-banners:
 *   put:
 *     tags: [adminCore]
 *     summary: 更新浏览页 Banner
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  "/system/browse-banners",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = adminBrowseBannersPutSchema.parse(ctx.request.body);
      const r = await BrowseBannerService.setForAdmin(body.items);
      success(ctx, r);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(
        ctx,
        e instanceof Error ? e.message : "保存失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/system/initial-notebooks:
 *   get:
 *     tags: [adminCore]
 *     summary: 新用户初始手帐本配置
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/system/initial-notebooks",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await InitialUserNotebookConfigService.getForAdmin();
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/system/initial-notebooks:
 *   put:
 *     tags: [adminCore]
 *     summary: 更新初始手帐本配置
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  "/system/initial-notebooks",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = adminInitialNotebooksPutSchema.parse(ctx.request.body);
      const r = await InitialUserNotebookConfigService.setForAdmin({
        templates: body.templates,
      });
      success(ctx, {
        templates: r.templates,
        updatedAt: r.updatedAt.toISOString(),
      });
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "保存失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/system/initial-notes:
 *   get:
 *     tags: [adminCore]
 *     summary: 新用户初始手帐配置
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/system/initial-notes",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await InitialUserNoteSeedConfigService.getForAdmin();
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/system/initial-notes:
 *   put:
 *     tags: [adminCore]
 *     summary: 更新初始手帐配置
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  "/system/initial-notes",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = adminInitialNotesPutSchema.parse(ctx.request.body);
      const r = await InitialUserNoteSeedConfigService.setForAdmin({
        templates: body.templates,
      });
      success(ctx, {
        templates: r.templates,
        updatedAt: r.updatedAt.toISOString(),
      });
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "保存失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

export default router;
