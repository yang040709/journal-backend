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
 * /admin/users:
 *   get:
 *     tags: [adminUsers]
 *     summary: 用户列表（分页）
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
  "/users",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    try {
      const q = userListQuerySchema.parse(ctx.query);
      const { items, total } = await AdminUserService.listUsers(
        q.page,
        q.limit,
        q.userId,
        q.createdAtFrom,
        q.createdAtTo,
      );
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
 * GET /admin/activity
 * 分页查询全站用户 Activity（时间倒序）；可选 query：userId（业务 id）、type、target
 */
/**
 * @openapi
 * /admin/activity:
 *   get:
 *     tags: [adminUsers]
 *     summary: 全站活动记录（分页）
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
  "/activity",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    try {
      const q = activityListQuerySchema.parse(ctx.query);
      const result = await AdminUserService.listAllActivities({
        page: q.page,
        limit: q.limit,
        userId: q.userId,
        type: q.type,
        target: q.target,
      });
      paginatedSuccess(
        ctx,
        result.items,
        result.total,
        result.page,
        result.limit,
        "获取活动日志成功",
      );
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      console.error("admin /activity:", e);
      error(ctx, "获取活动日志失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/users/{id}/overview:
 *   get:
 *     tags: [adminUsers]
 *     summary: 用户运营概览
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
  "/users/:id/overview",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    const mongoId = await AdminUserService.resolveMongoIdFromBizUserRouteParam(
      ctx.params.id,
    );
    if (!mongoId) {
      error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
      return;
    }
    const data = await AdminUserService.getUserOverview(mongoId);
    if (!data) {
      error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
      return;
    }
    success(ctx, data);
  },
);

/**
 * GET /admin/users/:id/activity
 * 分页查询指定用户的 Activity 时间线；`:id` 为业务 userId；可选 query：type、target
 */
/**
 * @openapi
 * /admin/users/{id}/activity:
 *   get:
 *     tags: [adminUsers]
 *     summary: 用户活动记录
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
  "/users/:id/activity",
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
      const q = userActivityQuerySchema.parse(ctx.query);
      const result = await AdminUserService.listUserActivities(mongoId, {
        page: q.page,
        limit: q.limit,
        type: q.type,
        target: q.target,
      });
      if (!result) {
        error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
        return;
      }
      paginatedSuccess(
        ctx,
        result.items,
        result.total,
        result.page,
        result.limit,
        "获取用户活动日志成功",
      );
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      console.error("admin users/:id/activity:", e);
      error(ctx, "获取用户活动日志失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/users/{id}:
 *   get:
 *     tags: [adminUsers]
 *     summary: 用户详情
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
  "/users/:id",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    const mongoId = await AdminUserService.resolveMongoIdFromBizUserRouteParam(
      ctx.params.id,
    );
    if (!mongoId) {
      error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
      return;
    }
    const user = await AdminUserService.getUserById(mongoId);
    if (!user) {
      error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
      return;
    }
    success(ctx, user);
  },
);

/** POST /admin/users/:id/jwt — 仅超级管理员可为指定业务 userId 生成 C 端 JWT */
/**
 * @openapi
 * /admin/users/{id}/jwt:
 *   post:
 *     tags: [adminUsers]
 *     summary: 创建jwt
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
  "/users/:id/jwt",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await AdminUserService.generateUserJwtByBizUserId(ctx.params.id);
    if (!data) {
      error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
      return;
    }
    success(ctx, data, "生成用户 JWT 成功");
  },
);

/**
 * @openapi
 * /admin/users/{id}/covers:
 *   get:
 *     tags: [adminUsers]
 *     summary: 获取covers
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
  "/users/:id/covers",
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
      const data = await AdminUserCoverService.getCoversPayload(mongoId);
      success(ctx, data);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "加载失败",
        ErrorCodes.USER_NOT_FOUND,
        404,
      );
    }
  },
);

/**
 * @openapi
 * /admin/image-assets:
 *   get:
 *     tags: [adminUsers]
 *     summary: 用户图片资产（分页）
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
  "/image-assets",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    try {
      const q = adminImageAssetsListQuerySchema.parse(ctx.query);
      const { items, total } = await listAll({
        page: q.page,
        limit: q.limit,
        source: q.source,
        userId: q.userId,
      });
      paginatedSuccess(ctx, items, total, q.page, q.limit, "获取图片资产列表成功");
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
 * /admin/users/{id}/image-assets:
 *   get:
 *     tags: [adminUsers]
 *     summary: 获取image-assets
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
  "/users/:id/image-assets",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    try {
      const biz = AdminUserService.decodeBizUserIdParam(ctx.params.id);
      if (!biz) {
        error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
        return;
      }
      const user = await User.findOne({ userId: biz }).select("userId").lean();
      if (!user) {
        error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
        return;
      }
      const bizUserId = String((user as { userId?: string }).userId || "").trim();
      if (!bizUserId) {
        error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
        return;
      }
      const qSchema = z.object({
        page: z.coerce.number().int().positive().optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        source: z.enum(["note", "cover"]).optional(),
      });
      const q = qSchema.parse(ctx.query);
      const { items, total } = await listByUser(bizUserId, {
        page: q.page,
        limit: q.limit,
        source: q.source,
      });
      paginatedSuccess(ctx, items, total, q.page, q.limit, "获取用户图片资产成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      console.error("admin image-assets:", e);
      error(ctx, "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/** GET /admin/users/:id/note-tags — `:id` 为业务 userId；返回系统预设与用户自定义标签 */
/**
 * @openapi
 * /admin/users/{id}/note-tags:
 *   get:
 *     tags: [adminUsers]
 *     summary: 获取note-tags
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
  "/users/:id/note-tags",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    try {
      const biz = AdminUserService.decodeBizUserIdParam(ctx.params.id);
      if (!biz) {
        error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
        return;
      }
      const user = await User.findOne({ userId: biz }).select("userId").lean();
      if (!user) {
        error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
        return;
      }
      const [systemTags, customTags] = await Promise.all([
        NotePresetTagService.getTagNames(),
        UserNoteCustomTagService.list(biz),
      ]);
      success(ctx, { systemTags, customTags }, "获取用户标签成功");
    } catch (e) {
      console.error("admin note-tags:", e);
      error(ctx, "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/users/{id}/covers/quick:
 *   put:
 *     tags: [adminUsers]
 *     summary: 更新quick
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
  "/users/:id/covers/quick",
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
      const body = adminQuickCoversBodySchema.parse(ctx.request.body);
      const data = await AdminUserCoverService.replaceQuickCovers(
        mongoId,
        body.covers,
      );
      success(ctx, data);
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
 * /admin/users/{id}/covers/custom:
 *   post:
 *     tags: [adminUsers]
 *     summary: 创建custom
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
  "/users/:id/covers/custom",
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
      const body = adminCustomCoverBodySchema.parse(ctx.request.body);
      const items = await AdminUserCoverService.addCustomCover(mongoId, {
        coverUrl: body.coverUrl,
        thumbUrl: body.thumbUrl,
        thumbKey: body.thumbKey,
      });
      success(ctx, items);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "新增失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

/**
 * @openapi
 * /admin/users/{id}/covers/custom/{coverId}:
 *   put:
 *     tags: [adminUsers]
 *     summary: 更新:coverId
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
  "/users/:id/covers/custom/:coverId",
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
      const body = adminCustomCoverBodySchema.parse(ctx.request.body);
      const items = await AdminUserCoverService.updateCustomCover(
        mongoId,
        ctx.params.coverId,
        {
          coverUrl: body.coverUrl,
          thumbUrl: body.thumbUrl,
          thumbKey: body.thumbKey,
        },
      );
      success(ctx, items);
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
 * /admin/users/{id}/covers/custom/{coverId}:
 *   delete:
 *     tags: [adminUsers]
 *     summary: 删除:coverId
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
  "/users/:id/covers/custom/:coverId",
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
      const items = await AdminUserCoverService.deleteCustomCover(
        mongoId,
        ctx.params.coverId,
      );
      success(ctx, items);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "删除失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

export default router;
