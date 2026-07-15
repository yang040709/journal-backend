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
 * /admin/ai/styles:
 *   get:
 *     tags: [adminAiStyles]
 *     summary: 获取styles
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
  "/ai/styles",
  requireAdminPage(ADMIN_PAGE_AI_STYLES),
  async (ctx) => {
    try {
      const rows = await AiStyleService.listForAdmin();
      success(ctx, rows);
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
 * /admin/ai/styles:
 *   post:
 *     tags: [adminAiStyles]
 *     summary: 创建styles
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
  "/ai/styles",
  requireAdminPage(ADMIN_PAGE_AI_STYLES),
  async (ctx) => {
    try {
      const body = aiStyleCreateSchema.parse(ctx.request.body);
      const row = await AiStyleService.createForAdmin({
        ...body,
        updatedBy: ctx.state.admin?.username || "",
      });
      success(ctx, row);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
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
 * /admin/ai/styles/{id}:
 *   get:
 *     tags: [adminAiStyles]
 *     summary: 获取:id
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
  "/ai/styles/:id",
  requireAdminPage(ADMIN_PAGE_AI_STYLES),
  async (ctx) => {
    try {
      const row = await AiStyleService.getByIdForAdmin(ctx.params.id);
      if (!row) {
        error(ctx, "风格不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      success(ctx, row);
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
 * /admin/ai/styles/{id}:
 *   put:
 *     tags: [adminAiStyles]
 *     summary: 更新:id
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
  "/ai/styles/:id",
  requireAdminPage(ADMIN_PAGE_AI_STYLES),
  async (ctx) => {
    try {
      const body = aiStyleUpdateSchema.parse(ctx.request.body);
      const row = await AiStyleService.updateForAdmin(ctx.params.id, {
        ...body,
        updatedBy: ctx.state.admin?.username || "",
      });
      if (!row) {
        error(ctx, "风格不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      success(ctx, row);
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
 * /admin/ai/styles/{id}/enable:
 *   post:
 *     tags: [adminAiStyles]
 *     summary: 创建enable
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
  "/ai/styles/:id/enable",
  requireAdminPage(ADMIN_PAGE_AI_STYLES),
  async (ctx) => {
    try {
      const body = aiStyleEnableSchema.parse(ctx.request.body);
      const row = await AiStyleService.setEnabled(ctx.params.id, body.enabled);
      if (!row) {
        error(ctx, "风格不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      success(ctx, row);
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
 * /admin/ai/styles/{id}/set-default:
 *   post:
 *     tags: [adminAiStyles]
 *     summary: 创建set-default
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
  "/ai/styles/:id/set-default",
  requireAdminPage(ADMIN_PAGE_AI_STYLES),
  async (ctx) => {
    try {
      const row = await AiStyleService.setDefault(ctx.params.id);
      if (!row) {
        error(ctx, "风格不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      success(ctx, row);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "设置默认失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/ai/styles/preview:
 *   post:
 *     tags: [adminAiStyles]
 *     summary: 创建preview
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
  "/ai/styles/preview",
  requireAdminPage(ADMIN_PAGE_AI_STYLES),
  async (ctx) => {
    try {
      const body = aiStylePreviewSchema.parse(ctx.request.body);
      const result = await AiNoteService.preview({
        styleKey: body.styleKey,
        mode: body.mode,
        title: body.title,
        content: body.content,
        tags: body.tags,
        hint: body.hint,
      });
      success(ctx, result);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      const msg = e instanceof Error ? e.message : "预览失败";
      if (msg === "AI service not configured") {
        error(ctx, "灵感服务暂不可用", ErrorCodes.INTERNAL_ERROR, 500);
        return;
      }
      error(ctx, msg, ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

export default router;
