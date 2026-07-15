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
import { AdminNoteTrashService } from "../../service/adminNoteTrash.service";
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
import { WechatMpNotifyService } from "../../service/wechatMpNotify.service";
import * as adminSchemas from "./admin.schemas";
import { ADMIN_EXPORT_LIMIT, daySpanInclusive } from "./admin.shared";

const {
  loginSchema,
  paginationSchema,
  noteListQuerySchema,
  riskNoteListQuerySchema,
  trashNoteListQuerySchema,
  adminRestoreTrashNoteSchema,
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
 * /admin/ai-consumption-logs:
 *   get:
 *     tags: [adminNotes]
 *     summary: AI 消费日志（分页）
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
  "/ai-consumption-logs",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    try {
      const q = aiConsumptionLogListQuerySchema.parse(ctx.query);
      const { items, total, page, limit } = await AiConsumptionLogService.listForAdmin({
        page: q.page,
        limit: q.limit,
        userId: q.userId,
        source: q.source,
        mode: q.mode,
        dateKeyFrom: q.dateKeyFrom,
        dateKeyTo: q.dateKeyTo,
        createdAtFrom: q.createdAtFrom,
        createdAtTo: q.createdAtTo,
      });
      paginatedSuccess(ctx, items as unknown as Record<string, unknown>[], total, page, limit);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "参数错误",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/** GET /admin/notes：支持 q（$text），与 tags 同时存在时服务端忽略 tags，见 AdminNoteService.listNotes */
/**
 * @openapi
 * /admin/notes:
 *   get:
 *     tags: [adminNotes]
 *     summary: 手帐列表（分页）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessPaginatedAdminNoteList'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/notes",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    try {
      const q = noteListQuerySchema.parse(ctx.query);
      const { items, total } = await AdminNoteService.listNotes({
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        order: q.order,
        userId: q.userId,
        noteBookId: q.noteBookId,
        tags: q.tags,
        startTime: q.startTime,
        endTime: q.endTime,
        isShare: q.isShare,
        isFavorite: q.isFavorite,
        isPinned: q.isPinned,
        excludeDefaultNotes:
          q.excludeDefaultNotes ?? q.excludeDefaultNotebooks,
        q: q.q,
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
 * /admin/notes/risk-items:
 *   get:
 *     tags: [adminNotes]
 *     summary: 风控手帐列表（分页）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessPaginatedAdminNoteList'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/notes/risk-items",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    try {
      const q = riskNoteListQuerySchema.parse(ctx.query);
      const { items, total } = await AdminNoteService.listRiskNotes({
        page: q.page,
        limit: q.limit,
        userId: q.userId,
        riskStatus: q.riskStatus,
        keyword: q.keyword,
        startTime: q.startTime,
        endTime: q.endTime,
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
 * /admin/notes/risk-items/{taskId}/snapshot:
 *   get:
 *     tags: [adminNotes]
 *     summary: 风控任务快照
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
  "/notes/risk-items/:taskId/snapshot",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    const taskId = String(ctx.params.taskId || "").trim();
    if (!taskId) {
      error(ctx, "taskId 不能为空", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    const snapshot = await AdminNoteService.getRiskTaskSnapshot(taskId);
    if (!snapshot) {
      error(ctx, "风控任务不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, snapshot);
  },
);

/**
 * @openapi
 * /admin/notes/trash:
 *   get:
 *     tags: [adminNotes]
 *     summary: 废纸篓手帐列表（全站，分页）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 */
router.get(
  "/notes/trash",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    try {
      const q = trashNoteListQuerySchema.parse(ctx.query);
      const { items, total } = await AdminNoteTrashService.listTrashNotes({
        page: q.page,
        limit: q.limit,
        userId: q.userId,
        noteBookId: q.noteBookId,
        keyword: q.keyword,
        deletedStartTime: q.deletedStartTime,
        deletedEndTime: q.deletedEndTime,
        includeExpired: q.includeExpired,
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
 * /admin/notes/trash/expired-count:
 *   get:
 *     tags: [adminNotes]
 *     summary: 已过期废纸篓手帐数量（超管）
 */
router.get(
  "/notes/trash/expired-count",
  requireSuperAdmin(),
  async (ctx) => {
    const count = await AdminNoteTrashService.countExpiredTrashNotes();
    success(ctx, { count });
  },
);

/**
 * @openapi
 * /admin/notes/trash/purge-expired:
 *   post:
 *     tags: [adminNotes]
 *     summary: 一键永久删除已过期废纸篓手帐（超管）
 */
router.post(
  "/notes/trash/purge-expired",
  requireSuperAdmin(),
  async (ctx) => {
    const result = await AdminNoteTrashService.purgeExpiredTrashNotes();
    if (result.purged > 0) {
      void WechatMpNotifyService.notifyHighRiskOp({
        opType: "废纸篓批量永久删除",
        operator: ctx.state.admin?.username || "unknown",
        target: "expired-trash-notes",
        summary: `已删除 ${result.purged}/${result.total} 条已过期手帐`,
      });
    }
    success(ctx, result, "批量删除完成");
  },
);

/**
 * @openapi
 * /admin/notes/trash/{id}:
 *   get:
 *     tags: [adminNotes]
 *     summary: 废纸篓手帐详情
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/notes/trash/:id",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    try {
      const q = trashNoteListQuerySchema
        .pick({ includeExpired: true })
        .parse(ctx.query);
      const note = await AdminNoteTrashService.getTrashNoteById(ctx.params.id, {
        includeExpired: q.includeExpired,
      });
      if (!note) {
        error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
        return;
      }
      success(ctx, note);
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
 * /admin/notes/trash/{id}/restore:
 *   post:
 *     tags: [adminNotes]
 *     summary: 从废纸篓恢复手帐
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/notes/trash/:id/restore",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    try {
      const body = adminRestoreTrashNoteSchema.parse(ctx.request.body || {});
      const restored = await AdminNoteTrashService.restoreNote(
        ctx.params.id,
        body.targetNoteBookId,
      );
      if (!restored) {
        error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
        return;
      }
      success(ctx, restored, "恢复手帐成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      if (e instanceof Error && e.message === "目标手帐本不存在或已删除") {
        error(ctx, e.message, ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
        return;
      }
      error(
        ctx,
        e instanceof Error ? e.message : "恢复失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/notes/trash/{id}/purge:
 *   delete:
 *     tags: [adminNotes]
 *     summary: 永久删除废纸篓手帐（超管）
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  "/notes/trash/:id/purge",
  requireSuperAdmin(),
  async (ctx) => {
    const result = await AdminNoteTrashService.purgeNote(ctx.params.id);
    if (!result.ok) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }
    void WechatMpNotifyService.notifyHighRiskOp({
      opType: "废纸篓永久删除",
      operator: ctx.state.admin?.username || "unknown",
      target: `noteId=${ctx.params.id}`,
      summary: `userId=${result.userId || "—"} · ${result.title || "—"}`,
    });
    success(ctx, { deleted: true }, "彻底删除成功");
  },
);

/**
 * @openapi
 * /admin/notes/{id}:
 *   get:
 *     tags: [adminNotes]
 *     summary: 手帐详情
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessAdminNote'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/notes/:id",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    const note = await AdminNoteService.getNoteById(ctx.params.id);
    if (!note) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }
    success(ctx, note);
  },
);

/**
 * @openapi
 * /admin/notes:
 *   post:
 *     tags: [adminNotes]
 *     summary: 创建手帐
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessAdminNote'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/notes",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    try {
      const body = createNoteSchema.parse(ctx.request.body);
      const note = await AdminNoteService.createNote({
        ...body,
        tags: body.tags,
        images: body.images,
      });
      success(ctx, note);
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
 * /admin/notes/{id}:
 *   put:
 *     tags: [adminNotes]
 *     summary: 更新手帐
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessAdminNote'
 *       '401':
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  "/notes/:id",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    try {
      const body = updateNoteSchema.parse(ctx.request.body);
      const note = await AdminNoteService.updateNote(ctx.params.id, body);
      if (!note) {
        error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
        return;
      }
      success(ctx, note);
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
 * /admin/notes/{id}:
 *   delete:
 *     tags: [adminNotes]
 *     summary: 删除手帐
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
  "/notes/:id",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    try {
      const ok = await AdminNoteService.deleteNote(ctx.params.id);
      if (!ok) {
        error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
        return;
      }
      success(ctx, { deleted: true });
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "删除失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/notes/batch-tags:
 *   post:
 *     tags: [adminNotes]
 *     summary: 批量设置手帐标签
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
  "/notes/batch-tags",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = batchTagsBodySchema.parse(ctx.request.body);
      const r = await AdminNoteService.batchSetTags(
        body.noteIds,
        body.tags,
        body.mode,
      );
      success(ctx, r);
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
 * /admin/notes/batch-share:
 *   post:
 *     tags: [adminNotes]
 *     summary: 批量设置手帐分享
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
  "/notes/batch-share",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = batchShareBodySchema.parse(ctx.request.body);
      const r = await AdminNoteService.batchSetShare(
        body.noteIds,
        body.isShare,
      );
      success(ctx, r);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "参数错误",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

export default router;
