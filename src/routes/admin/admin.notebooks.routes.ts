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
 * /admin/notebooks:
 *   get:
 *     tags: [adminNotebooks]
 *     summary: 手帐本列表（分页）
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
  "/notebooks",
  requireAdminPage(ADMIN_PAGE_NOTEBOOKS),
  async (ctx) => {
    try {
      const q = paginationSchema.parse(ctx.query);
      const { items, total } = await AdminNoteBookService.listNoteBooks({
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        order: q.order,
        userId: q.userId,
      });
      paginatedSuccess(ctx, items, total, q.page, q.limit);
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
 * /admin/notebooks/{id}/export-json:
 *   get:
 *     tags: [adminNotebooks]
 *     summary: 获取export-json
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
  "/notebooks/:id/export-json",
  requireAdminPage(ADMIN_PAGE_NOTEBOOKS),
  async (ctx) => {
    try {
      const result = await AdminNotebookMigrationService.exportNotebook(
        ctx.params.id,
      );
      const encodedFileName = encodeURIComponent(result.fileName).replace(
        /'/g,
        "%27",
      );
      ctx.set("Content-Type", "application/json; charset=utf-8");
      ctx.set(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodedFileName}`,
      );
      ctx.body = JSON.stringify(result.envelope, null, 2);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "导出失败";
      if (msg.includes("不存在") || msg.includes("已删除")) {
        error(ctx, msg, ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
        return;
      }
      error(ctx, msg, ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

/**
 * @openapi
 * /admin/notebooks/import-json:
 *   post:
 *     tags: [adminNotebooks]
 *     summary: 导入手帐本 JSON
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
  "/notebooks/import-json",
  requireAdminPage(ADMIN_PAGE_NOTEBOOKS),
  async (ctx) => {
    try {
      const body = importNotebookJsonSchema.parse(ctx.request.body);
      const result = await AdminNotebookMigrationService.importNotebook(
        body.userId,
        body.data,
        { titleOverride: body.titleOverride },
      );
      success(ctx, result, "导入成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      const msg = e instanceof Error ? e.message : "导入失败";
      if (msg.includes("目标用户不存在")) {
        error(ctx, msg, ErrorCodes.NOT_FOUND, 404);
        return;
      }
      error(ctx, msg, ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

/**
 * @openapi
 * /admin/notebooks/{id}:
 *   get:
 *     tags: [adminNotebooks]
 *     summary: 手帐本详情
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
  "/notebooks/:id",
  requireAdminPage(ADMIN_PAGE_NOTEBOOKS),
  async (ctx) => {
    const nb = await AdminNoteBookService.getNoteBookById(ctx.params.id);
    if (!nb) {
      error(ctx, "手帐本不存在", ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
      return;
    }
    success(ctx, nb);
  },
);

/**
 * @openapi
 * /admin/notebooks:
 *   post:
 *     tags: [adminNotebooks]
 *     summary: 创建手帐本
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
  "/notebooks",
  requireAdminPage(ADMIN_PAGE_NOTEBOOKS),
  async (ctx) => {
    try {
      const body = createNoteBookSchema.parse(ctx.request.body);
      const nb = await AdminNoteBookService.createNoteBook(body);
      success(ctx, nb);
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
 * /admin/notebooks/{id}:
 *   put:
 *     tags: [adminNotebooks]
 *     summary: 更新手帐本
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
  "/notebooks/:id",
  requireAdminPage(ADMIN_PAGE_NOTEBOOKS),
  async (ctx) => {
    try {
      const body = updateNoteBookSchema.parse(ctx.request.body);
      const nb = await AdminNoteBookService.updateNoteBook(ctx.params.id, body);
      if (!nb) {
        error(ctx, "手帐本不存在", ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
        return;
      }
      success(ctx, nb);
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
 * /admin/notebooks/{id}:
 *   delete:
 *     tags: [adminNotebooks]
 *     summary: 删除手帐本
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
router.delete(
  "/notebooks/:id",
  requireAdminPage(ADMIN_PAGE_NOTEBOOKS),
  async (ctx) => {
    const ok = await AdminNoteBookService.deleteNoteBook(ctx.params.id);
    if (!ok) {
      error(ctx, "手帐本不存在", ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
      return;
    }
    success(ctx, { deleted: true });
  },
);

export default router;
