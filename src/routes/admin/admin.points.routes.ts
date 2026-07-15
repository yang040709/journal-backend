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
 * /admin/points/transactions:
 *   get:
 *     tags: [adminPoints]
 *     summary: 积分流水（分页）
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
  "/points/transactions",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    try {
      const q = pointsTransactionsQuerySchema.parse(ctx.query);
      const data = await PointsService.adminListTransactions({
        page: q.page,
        pageSize: q.pageSize,
        flowType: q.flowType,
        bizType: q.bizType,
        userId: q.userId,
        keyword: q.keyword,
        startTime: q.startTime != null ? new Date(q.startTime) : undefined,
        endTime: q.endTime != null ? new Date(q.endTime) : undefined,
      });
      success(ctx, data);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      if (
        e instanceof Error &&
        (e.message.includes("分页深度超过限制") || e.message.includes("搜索关键词至少"))
      ) {
        error(ctx, e.message, ErrorCodes.PARAM_ERROR, 400);
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
 * /admin/reviews:
 *   get:
 *     tags: [adminPoints]
 *     summary: 用户评价列表（分页）
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
  "/reviews",
  requireAdminPage(ADMIN_PAGE_REVIEWS),
  async (ctx) => {
    try {
      const q = adminReviewListQuerySchema.parse(ctx.query);
      const data = await UserReviewService.adminList(q);
      paginatedSuccess(ctx, data.items, data.total, data.page, data.limit);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/reviews:
 *   post:
 *     tags: [adminPoints]
 *     summary: 创建用户评价
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
  "/reviews",
  requireAdminPage(ADMIN_PAGE_REVIEWS),
  async (ctx) => {
    try {
      const body = adminReviewCreateSchema.parse(ctx.request.body || {});
      const row = await UserReviewService.adminCreate(body);
      success(ctx, row, "创建成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "创建失败", ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

/**
 * @openapi
 * /admin/reviews/{id}:
 *   put:
 *     tags: [adminPoints]
 *     summary: 更新用户评价
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
  "/reviews/:id",
  requireAdminPage(ADMIN_PAGE_REVIEWS),
  async (ctx) => {
    try {
      const body = adminReviewUpdateSchema.parse(ctx.request.body || {});
      if (
        body.content === undefined &&
        body.username === undefined &&
        body.tag === undefined &&
        body.imageUrl === undefined &&
        body.status === undefined &&
        body.sortOrder === undefined
      ) {
        error(ctx, "无有效更新字段", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      const row = await UserReviewService.adminUpdate(String(ctx.params.id || ""), body);
      if (!row) {
        error(ctx, "评价不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      success(ctx, row, "更新成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "更新失败", ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

/**
 * @openapi
 * /admin/reviews/{id}:
 *   delete:
 *     tags: [adminPoints]
 *     summary: 删除用户评价
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
  "/reviews/:id",
  requireAdminPage(ADMIN_PAGE_REVIEWS),
  async (ctx) => {
    const ok = await UserReviewService.adminDelete(String(ctx.params.id || ""));
    if (!ok) {
      error(ctx, "评价不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, { deleted: true });
  },
);

/**
 * @openapi
 * /admin/points-campaigns:
 *   get:
 *     tags: [adminPoints]
 *     summary: 获取points-campaigns
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
  "/points-campaigns",
  requireAdminPage(ADMIN_PAGE_POINTS_CAMPAIGNS),
  async (ctx) => {
    try {
      const q = pointsCampaignListQuerySchema.parse(ctx.query);
      const { items, total, page, limit } = await PointsCampaignService.listCampaigns({
        page: q.page,
        limit: q.limit,
        status: q.status,
        keyword: q.keyword,
      });
      paginatedSuccess(ctx, items, total, page, limit);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/points-campaigns:
 *   post:
 *     tags: [adminPoints]
 *     summary: 创建points-campaigns
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
  "/points-campaigns",
  requireAdminPage(ADMIN_PAGE_POINTS_CAMPAIGNS),
  async (ctx) => {
    try {
      const body = pointsCampaignCreateSchema.parse(ctx.request.body);
      const admin = ctx.state.admin!;
      const data = await PointsCampaignService.createCampaign(
        {
          name: body.name,
          description: body.description,
          pointValue: body.pointValue,
          quota: body.quota,
          startAt: body.startAt,
          endAt: body.endAt,
          successCopy: body.successCopy,
          channelRemark: body.channelRemark,
        },
        { id: admin.id, username: admin.username },
        String(ctx.state.requestId || ""),
      );
      success(ctx, data, "创建成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "创建失败", ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

/**
 * @openapi
 * /admin/points-campaigns/{id}:
 *   put:
 *     tags: [adminPoints]
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
  "/points-campaigns/:id",
  requireAdminPage(ADMIN_PAGE_POINTS_CAMPAIGNS),
  async (ctx) => {
    try {
      const body = pointsCampaignUpdateSchema.parse(ctx.request.body);
      const admin = ctx.state.admin!;
      const data = await PointsCampaignService.updateCampaign(
        String(ctx.params.id || ""),
        body,
        { id: admin.id, username: admin.username },
        String(ctx.state.requestId || ""),
      );
      success(ctx, data, "更新成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      if (e instanceof CampaignNotFoundError) {
        error(ctx, "活动不存在", ErrorCodes.CAMPAIGN_NOT_FOUND, 404);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "更新失败", ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

/**
 * @openapi
 * /admin/points-campaigns/{id}/publish:
 *   post:
 *     tags: [adminPoints]
 *     summary: 创建publish
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
  "/points-campaigns/:id/publish",
  requireAdminPage(ADMIN_PAGE_POINTS_CAMPAIGNS),
  async (ctx) => {
    try {
      const admin = ctx.state.admin!;
      const data = await PointsCampaignService.publishCampaign(
        String(ctx.params.id || ""),
        { id: admin.id, username: admin.username },
        String(ctx.state.requestId || ""),
      );
      success(ctx, data, "发布成功");
    } catch (e) {
      if (e instanceof CampaignNotFoundError) {
        error(ctx, "活动不存在", ErrorCodes.CAMPAIGN_NOT_FOUND, 404);
        return;
      }
      console.error("[admin.points-campaigns.publish] failed", {
        campaignId: String(ctx.params.id || ""),
        admin: ctx.state.admin?.username,
        requestId: String(ctx.state.requestId || ""),
        error: e instanceof Error ? e.message : String(e),
      });
      error(ctx, e instanceof Error ? e.message : "发布失败", ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

/**
 * @openapi
 * /admin/points-campaigns/{id}/offline:
 *   post:
 *     tags: [adminPoints]
 *     summary: 创建offline
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
  "/points-campaigns/:id/offline",
  requireAdminPage(ADMIN_PAGE_POINTS_CAMPAIGNS),
  async (ctx) => {
    try {
      const admin = ctx.state.admin!;
      const data = await PointsCampaignService.offlineCampaign(
        String(ctx.params.id || ""),
        { id: admin.id, username: admin.username },
        String(ctx.state.requestId || ""),
      );
      success(ctx, data, "下线成功");
    } catch (e) {
      if (e instanceof CampaignNotFoundError) {
        error(ctx, "活动不存在", ErrorCodes.CAMPAIGN_NOT_FOUND, 404);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "下线失败", ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

/**
 * @openapi
 * /admin/points-campaigns/{id}:
 *   get:
 *     tags: [adminPoints]
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
  "/points-campaigns/:id",
  requireAdminPage(ADMIN_PAGE_POINTS_CAMPAIGNS),
  async (ctx) => {
    try {
      const data = await PointsCampaignService.getCampaignForAdmin(String(ctx.params.id || ""));
      success(ctx, data);
    } catch (e) {
      if (e instanceof CampaignNotFoundError) {
        error(ctx, "活动不存在", ErrorCodes.CAMPAIGN_NOT_FOUND, 404);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/points-campaigns/{id}/claims:
 *   get:
 *     tags: [adminPoints]
 *     summary: 获取claims
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
  "/points-campaigns/:id/claims",
  requireAdminPage(ADMIN_PAGE_POINTS_CAMPAIGNS),
  async (ctx) => {
    try {
      const q = z
        .object({
          page: z.coerce.number().int().positive().optional().default(1),
          limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        })
        .parse(ctx.query);
      const data = await PointsCampaignService.listCampaignClaims(String(ctx.params.id || ""), q.page, q.limit);
      paginatedSuccess(ctx, data.items, data.total, data.page, data.limit);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/points/rule-change-logs:
 *   get:
 *     tags: [adminPoints]
 *     summary: 积分规则变更日志
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
  "/points/rule-change-logs",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const q = pointsRuleLogQuerySchema.parse(ctx.query);
      const skip = (q.page - 1) * q.limit;
      const [rows, total] = await Promise.all([
        PointsRuleChangeLog.find({})
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(q.limit)
          .lean(),
        PointsRuleChangeLog.countDocuments({}),
      ]);
      paginatedSuccess(ctx, rows, total, q.page, q.limit);
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
