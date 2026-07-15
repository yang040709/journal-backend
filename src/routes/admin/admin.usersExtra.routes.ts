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
import { NotebookLimitsService } from "../../service/notebookLimits.service";
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
import { WechatMpNotifyService } from "../../service/wechatMpNotify.service";
import {
  formatMigrationSummary,
  formatMigrationTarget,
  formatPointsRulesChange,
  formatQuotaChange,
  hasPointsRulesChange,
  hasQuotaChange,
} from "../../utils/adminMpNotifyFormat";
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
  adminNotebookLimitsPutSchema,
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
 * /admin/users:
 *   post:
 *     tags: [adminUsers]
 *     summary: 创建用户
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
router.post(
  "/users",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    try {
      const body = createUserSchema.parse(ctx.request.body);
      const user = await AdminUserService.createUser(body);
      success(ctx, AdminUserService.serializeUser(user));
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "创建失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/users/{id}:
 *   put:
 *     tags: [adminUsers]
 *     summary: 更新用户
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
  "/users/:id",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    try {
      const mongoId = await AdminUserService.resolveMongoIdFromBizUserRouteParam(
        ctx.params.id,
      );
      if (!mongoId) {
        error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
        return;
      }
      const body = updateUserSchema.parse(ctx.request.body);
      const user = await AdminUserService.updateUser(
        mongoId,
        body,
        ctx.state.admin!,
      );
      if (!user) {
        error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
        return;
      }
      success(ctx, AdminUserService.serializeUser(user));
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "更新失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/users/migration/precheck:
 *   post:
 *     tags: [adminUsers]
 *     summary: 创建precheck
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
router.post(
  "/users/migration/precheck",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = userMigrationPrecheckSchema.parse(ctx.request.body);
      const data = await UserMigrationService.precheck(body);
      success(ctx, data);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.USER_MIGRATION_PARAM_INVALID, 400);
        return;
      }
      if (e instanceof MigrationBusinessError) {
        if (e.code === "PARAM") {
          error(ctx, e.message, ErrorCodes.USER_MIGRATION_PARAM_INVALID, 400);
          return;
        }
        if (e.code === "NOT_FOUND") {
          error(ctx, e.message, ErrorCodes.USER_MIGRATION_NOT_FOUND, 404);
          return;
        }
      }
      error(
        ctx,
        e instanceof Error ? e.message : "预检查失败",
        ErrorCodes.INTERNAL_ERROR,
        500,
      );
    }
  },
);

/**
 * @openapi
 * /admin/users/migration/execute:
 *   post:
 *     tags: [adminUsers]
 *     summary: 执行用户迁移（body）
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
router.post(
  "/users/migration/execute",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = userMigrationExecuteSchema.parse(ctx.request.body);
      const data = await UserMigrationService.execute(body);
      const task = (data as { task?: { taskId?: string; status?: string }; idempotentHit?: boolean }).task;
      void WechatMpNotifyService.notifyHighRiskOp({
        opType: "一键迁徙执行",
        operator: ctx.state.admin?.username || "unknown",
        target: formatMigrationTarget(body.sourceOpenid, body.targetOpenid),
        summary: formatMigrationSummary(
          task?.taskId || "",
          task?.status,
          Boolean((data as { idempotentHit?: boolean }).idempotentHit),
        ),
      });
      success(ctx, data);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.USER_MIGRATION_PARAM_INVALID, 400);
        return;
      }
      if (e instanceof MigrationBusinessError) {
        if (e.code === "PARAM") {
          error(ctx, e.message, ErrorCodes.USER_MIGRATION_PARAM_INVALID, 400);
          return;
        }
        if (e.code === "NOT_FOUND") {
          error(ctx, e.message, ErrorCodes.USER_MIGRATION_NOT_FOUND, 404);
          return;
        }
        if (e.code === "CONFLICT") {
          error(ctx, e.message, ErrorCodes.USER_MIGRATION_CONFLICT, 409);
          return;
        }
      }
      error(
        ctx,
        e instanceof Error ? e.message : "迁徙执行失败",
        ErrorCodes.INTERNAL_ERROR,
        500,
      );
    }
  },
);

/**
 * @openapi
 * /admin/users/migration/tasks/{taskId}:
 *   get:
 *     tags: [adminUsers]
 *     summary: 获取:taskId
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
  "/users/migration/tasks/:taskId",
  requireSuperAdmin(),
  async (ctx) => {
    const taskId = String(ctx.params.taskId || "").trim();
    if (!taskId) {
      error(ctx, "taskId 不能为空", ErrorCodes.USER_MIGRATION_PARAM_INVALID, 400);
      return;
    }
    const data = await UserMigrationService.getTaskDetail(taskId);
    if (!data) {
      error(ctx, "迁徙任务不存在", ErrorCodes.USER_MIGRATION_NOT_FOUND, 404);
      return;
    }
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/points/rules:
 *   get:
 *     tags: [adminUsers]
 *     summary: 积分规则
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
  "/points/rules",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const rules = await PointsService.getRules();
      success(ctx, rules);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "加载失败",
        ErrorCodes.INTERNAL_ERROR,
        500,
      );
    }
  },
);

/**
 * @openapi
 * /admin/quota/base-limits:
 *   get:
 *     tags: [adminUsers]
 *     summary: 额度基础上限配置
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
  "/quota/base-limits",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const data = await QuotaBaseLimitsService.getForAdmin();
      success(ctx, data);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "加载失败",
        ErrorCodes.INTERNAL_ERROR,
        500,
      );
    }
  },
);

/**
 * @openapi
 * /admin/quota/base-limits:
 *   put:
 *     tags: [adminUsers]
 *     summary: 更新额度基础上限
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
  "/quota/base-limits",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = adminQuotaBaseLimitsPutSchema.parse(ctx.request.body);
      const prev = await QuotaBaseLimitsService.getForAdmin();
      await QuotaBaseLimitsService.setFromAdmin(body);
      const data = await QuotaBaseLimitsService.getForAdmin();
      if (hasQuotaChange(prev, data)) {
        void WechatMpNotifyService.notifyHighRiskOp({
          opType: "额度上限修改",
          operator: ctx.state.admin?.username || "unknown",
          target: "全员基础额度",
          summary: formatQuotaChange(prev, data),
        });
      }
      success(ctx, data);
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
 * /admin/notebook/limits:
 *   get:
 *     tags: [adminUsers]
 *     summary: 手帐本数量上限配置
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
router.get("/notebook/limits", requireSuperAdmin(), async (ctx) => {
  try {
    const data = await NotebookLimitsService.getForAdmin();
    success(ctx, data);
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
 * /admin/notebook/limits:
 *   put:
 *     tags: [adminUsers]
 *     summary: 更新手帐本数量上限
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
router.put("/notebook/limits", requireSuperAdmin(), async (ctx) => {
  try {
    const body = adminNotebookLimitsPutSchema.parse(ctx.request.body);
    // Zod 未同时给出两侧时，服务端 normalize 仍会钳制 default ≤ hard
    if (
      body.defaultMaxNoteBookCount !== undefined &&
      body.hardMaxNoteBookCount === undefined
    ) {
      const prev = await NotebookLimitsService.getNotebookLimits();
      if (body.defaultMaxNoteBookCount > prev.hardMaxNoteBookCount) {
        error(ctx, "默认上限不能大于硬顶", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
    }
    await NotebookLimitsService.setFromAdmin(body);
    const data = await NotebookLimitsService.getForAdmin();
    success(ctx, data);
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
});

/**
 * @openapi
 * /admin/export/settings:
 *   get:
 *     tags: [adminUsers]
 *     summary: 手帐导出设置
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
  "/export/settings",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const data = await NoteExportSettingsService.get();
      success(ctx, data);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "加载失败",
        ErrorCodes.INTERNAL_ERROR,
        500,
      );
    }
  },
);

/**
 * @openapi
 * /admin/export/settings:
 *   put:
 *     tags: [adminUsers]
 *     summary: 更新手帐导出设置
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
  "/export/settings",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = adminExportSettingsPutSchema.parse(ctx.request.body);
      const data = await NoteExportSettingsService.set(body);
      success(ctx, data);
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
 * /admin/reading-theme-catalog:
 *   get:
 *     tags: [adminUsers]
 *     summary: 阅读主题目录
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
  "/reading-theme-catalog",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const data = await ReadingThemeCatalogConfigService.getForAdmin();
      success(ctx, data);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "加载失败",
        ErrorCodes.INTERNAL_ERROR,
        500,
      );
    }
  },
);

/**
 * @openapi
 * /admin/reading-theme-catalog:
 *   put:
 *     tags: [adminUsers]
 *     summary: 更新阅读主题目录
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
  "/reading-theme-catalog",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = readingThemeCatalogPutSchema.parse(ctx.request.body);
      const data = await ReadingThemeCatalogConfigService.updateFromAdmin(body);
      success(ctx, data);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      if (e instanceof ReadingThemeCatalogValidationError) {
        error(ctx, e.message, ErrorCodes.PARAM_ERROR, 400);
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
 * /admin/reading-theme-catalog/reset-default:
 *   post:
 *     tags: [adminUsers]
 *     summary: 重置阅读主题目录为默认
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
router.post(
  "/reading-theme-catalog/reset-default",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const data = await ReadingThemeCatalogConfigService.resetToDefault();
      success(ctx, data);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "重置失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/note-export-logs:
 *   get:
 *     tags: [adminUsers]
 *     summary: 手帐导出日志（分页）
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
  "/note-export-logs",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const q = noteExportLogQuerySchema.parse(ctx.query);
      const filter: Record<string, unknown> = {};
      if (q.userId?.trim()) {
        filter.userId = q.userId.trim();
      }
      const skip = (q.page - 1) * q.limit;
      const [rows, total] = await Promise.all([
        NoteExportLog.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(q.limit)
          .lean(),
        NoteExportLog.countDocuments(filter),
      ]);
      paginatedSuccess(ctx, rows, total, q.page, q.limit);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(
        ctx,
        e instanceof Error ? e.message : "加载失败",
        ErrorCodes.INTERNAL_ERROR,
        500,
      );
    }
  },
);

/**
 * @openapi
 * /admin/points/rules:
 *   put:
 *     tags: [adminUsers]
 *     summary: 更新积分规则
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
  "/points/rules",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = adminPointsRulesPutSchema.parse(ctx.request.body);
      const admin = ctx.state.admin!;
      const prev = await PointsService.getRules();
      const rules = await PointsService.setRulesFromAdmin(body, {
        id: admin.id,
        username: admin.username,
      });
      if (hasPointsRulesChange(prev, rules)) {
        void WechatMpNotifyService.notifyHighRiskOp({
          opType: "积分规则修改",
          operator: admin.username,
          target: "广告/兑换规则",
          summary: formatPointsRulesChange(prev, rules),
        });
      }
      success(ctx, rules);
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

export default router;
