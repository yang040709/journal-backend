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
import { WechatMpNotifyService } from "../../service/wechatMpNotify.service";
import Admin from "../../model/Admin";
import {
  describeAdminUpdate,
  describeAdminUpdateSummary,
  formatPurgeSummary,
  tailId,
} from "../../utils/adminMpNotifyFormat";
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
 * /admin/feedbacks:
 *   get:
 *     tags: [adminFeedbacks]
 *     summary: 反馈列表（分页）
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
  "/feedbacks",
  requireAdminPage(ADMIN_PAGE_FEEDBACKS),
  async (ctx) => {
    try {
      const q = feedbackListQuerySchema.parse(ctx.query);
      const { items, total, page, limit } = await FeedbackService.adminListFeedbacks(q);
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
 * /admin/feedbacks/review/next:
 *   get:
 *     tags: [adminFeedbacks]
 *     summary: 下一条待审核反馈
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
  "/feedbacks/review/next",
  requireAdminPage(ADMIN_PAGE_FEEDBACKS),
  async (ctx) => {
    try {
      const q = feedbackNextQuerySchema.parse(ctx.query);
      const nextId = await FeedbackService.adminNextPendingFeedbackId(
        q.currentId || undefined,
        q.direction,
      );
      success(ctx, { id: nextId || null });
    } catch (e) {
      error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/feedbacks/quick-replies:
 *   get:
 *     tags: [adminFeedbacks]
 *     summary: 反馈快捷回复列表
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
  "/feedbacks/quick-replies",
  requireAdminPage(ADMIN_PAGE_FEEDBACKS),
  async (ctx) => {
    try {
      const data = await FeedbackQuickReplyService.getForAdmin();
      success(ctx, data);
    } catch (e) {
      error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/feedbacks/quick-replies:
 *   put:
 *     tags: [adminFeedbacks]
 *     summary: 更新quick-replies
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
  "/feedbacks/quick-replies",
  requireAdminPage(ADMIN_PAGE_FEEDBACKS),
  async (ctx) => {
    try {
      const body = feedbackQuickRepliesBodySchema.parse(ctx.request.body);
      const data = await FeedbackQuickReplyService.setItems(body.items);
      success(ctx, data, "保存成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "保存失败", ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

/**
 * @openapi
 * /admin/feedbacks/{id}:
 *   get:
 *     tags: [adminFeedbacks]
 *     summary: 反馈详情
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
  "/feedbacks/:id",
  requireAdminPage(ADMIN_PAGE_FEEDBACKS),
  async (ctx) => {
    try {
      const row = await FeedbackService.adminGetFeedback(String(ctx.params.id || ""));
      if (!row) {
        error(ctx, "反馈不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      success(ctx, row);
    } catch (e) {
      error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/feedbacks/{id}/review:
 *   post:
 *     tags: [adminFeedbacks]
 *     summary: 审核反馈
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
  "/feedbacks/:id/review",
  requireAdminPage(ADMIN_PAGE_FEEDBACKS),
  async (ctx) => {
    try {
      const body = feedbackReviewBodySchema.parse(ctx.request.body);
      const data = await FeedbackService.adminReviewFeedback(
        String(ctx.params.id || ""),
        {
          reviewLevel: body.reviewLevel,
          reviewRemark: body.reviewRemark,
          userReply: body.userReply,
          rewardPoints: body.rewardPoints,
        },
        ctx.state.admin!,
      );
      success(ctx, data, "处理成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      if (e instanceof Error && e.message === "反馈不存在") {
        error(ctx, "反馈不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "处理失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/feedbacks/batch-review:
 *   post:
 *     tags: [adminFeedbacks]
 *     summary: 批量审核反馈
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
  "/feedbacks/batch-review",
  requireAdminPage(ADMIN_PAGE_FEEDBACKS),
  async (ctx) => {
    try {
      const body = feedbackBatchReviewBodySchema.parse(ctx.request.body);
      const result = await FeedbackService.adminBatchReviewFeedbacks(
        body.ids,
        {
          reviewLevel: body.reviewLevel,
          reviewRemark: body.reviewRemark,
          userReply: body.userReply,
          rewardPoints: body.rewardPoints,
        },
        ctx.state.admin!,
      );
      console.info("[admin.feedbacks.batch-review]", {
        admin: ctx.state.admin?.username,
        requestId: ctx.state.requestId,
        reviewLevel: body.reviewLevel,
        total: result.total,
        successCount: result.successCount,
        failedCount: result.failedCount,
      });
      success(ctx, result);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "处理失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/feedbacks/{id}/user-reply:
 *   patch:
 *     tags: [adminFeedbacks]
 *     summary: 管理员回复用户反馈
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
router.patch(
  "/feedbacks/:id/user-reply",
  requireAdminPage(ADMIN_PAGE_FEEDBACKS),
  async (ctx) => {
    try {
      const body = feedbackUserReplyBodySchema.parse(ctx.request.body);
      const data = await FeedbackService.adminUpdateUserReply(
        String(ctx.params.id || ""),
        { userReply: body.userReply },
        ctx.state.admin!,
      );
      success(ctx, data, "回复已更新");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      if (e instanceof Error && e.message === "反馈不存在") {
        error(ctx, "反馈不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      if (e instanceof Error && e.message === "仅已处理的反馈可修改回复") {
        error(ctx, e.message, ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "更新失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/feedbacks/export:
 *   get:
 *     tags: [adminFeedbacks]
 *     summary: 导出反馈数据
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
  "/feedbacks/export",
  requireAdminPage(ADMIN_PAGE_FEEDBACKS),
  async (ctx) => {
    try {
      const q = feedbackExportQuerySchema.parse(ctx.query);
      const ids = String(q.ids || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (q.mode === "selected" && ids.length === 0) {
        error(ctx, "请选择要导出的数据", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      const result = await FeedbackService.adminExportFeedbacksCsv({
        ids: q.mode === "selected" ? ids : undefined,
        query:
          q.mode === "filtered"
            ? {
                status: q.status,
                reviewLevel: q.reviewLevel,
                type: q.type,
                keyword: q.keyword,
                userId: q.userId,
              }
            : undefined,
        limit: ADMIN_EXPORT_LIMIT + 1,
      });
      if (result.exportedCount > ADMIN_EXPORT_LIMIT) {
        error(
          ctx,
          `导出数量超过上限（${ADMIN_EXPORT_LIMIT}）`,
          ErrorCodes.PARAM_ERROR,
          400,
        );
        return;
      }
      console.info("[admin.feedbacks.export]", {
        admin: ctx.state.admin?.username,
        requestId: ctx.state.requestId,
        mode: q.mode,
        exportedCount: result.exportedCount,
      });
      const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      ctx.set("Content-Type", "text/csv; charset=utf-8");
      ctx.set("Content-Disposition", `attachment; filename="feedbacks-${now}.csv"`);
      ctx.body = result.csv;
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "导出失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/feedback-config:
 *   get:
 *     tags: [adminFeedbacks]
 *     summary: 反馈配置
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
  "/feedback-config",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const rules = await PointsService.getRules();
      success(ctx, rules.feedbackRewards);
    } catch (e) {
      error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

/**
 * @openapi
 * /admin/feedback-config:
 *   put:
 *     tags: [adminFeedbacks]
 *     summary: 更新反馈配置
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
  "/feedback-config",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = z
        .object({
          weeklyFirstSubmit: z.number().int().min(0).max(1_000_000).optional(),
          important: z.number().int().min(0).max(1_000_000).optional(),
          critical: z.number().int().min(0).max(10_000).optional(),
        })
        .parse(ctx.request.body);
      const admin = ctx.state.admin!;
      const rules = await PointsService.setRulesFromAdmin(
        { feedbackRewards: body },
        { id: admin.id, username: admin.username },
      );
      success(ctx, rules.feedbackRewards);
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      error(ctx, e instanceof Error ? e.message : "保存失败", ErrorCodes.PARAM_ERROR);
    }
  },
);

/**
 * @openapi
 * /admin/users/{id}:
 *   delete:
 *     tags: [adminFeedbacks]
 *     summary: 删除用户
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
  "/users/:id",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    const bizUserId = AdminUserService.decodeBizUserIdParam(ctx.params.id);
    if (!bizUserId) {
      error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
      return;
    }

    const dryRun = UserPurgeService.parseDryRunQuery((ctx.query as any)?.dryRun);
    const withCos = UserPurgeService.parseWithCosQuery((ctx.query as any)?.withCos);
    const verifyRaw = (ctx.query as any)?.verify;
    const verify = verifyRaw === undefined ? true : UserPurgeService.parseDryRunQuery(verifyRaw);

    const r = await UserPurgeService.purgeByBizUserId(bizUserId, {
      dryRun,
      withCos,
      verify,
      useTransactionIfPossible: true,
    });
    if (!r) {
      error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
      return;
    }
    void WechatMpNotifyService.notifyHighRiskOp({
      opType: "用户彻底删除",
      operator: ctx.state.admin?.username || "unknown",
      target: `用户 ${tailId(bizUserId)}`,
      summary: formatPurgeSummary({ dryRun, withCos }),
    });
    success(ctx, { ...(r as any), deleted: true });
  },
);

/**
 * @openapi
 * /admin/admins:
 *   get:
 *     tags: [adminFeedbacks]
 *     summary: 管理员账号列表
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
  "/admins",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const q = paginationSchema.parse(ctx.query);
      const { items, total } = await AdminAccountService.listAdmins(
        q.page,
        q.limit,
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
 * @openapi
 * /admin/admins:
 *   post:
 *     tags: [adminFeedbacks]
 *     summary: 创建管理员账号
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
  "/admins",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = createAdminSchema.parse(ctx.request.body);
      const doc = await AdminAccountService.createAdmin(body);
      void WechatMpNotifyService.notifyHighRiskOp({
        opType: "新建管理员",
        operator: ctx.state.admin?.username || "unknown",
        target: body.username,
        summary: "已创建",
      });
      success(
        ctx,
        AdminAccountService.serializeAdminDoc(doc),
      );
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
 * /admin/admins/{id}:
 *   put:
 *     tags: [adminFeedbacks]
 *     summary: 更新管理员账号
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
  "/admins/:id",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = updateAdminSchema.parse(ctx.request.body);
      const doc = await AdminAccountService.updateAdmin(ctx.params.id, body);
      if (!doc) {
        error(ctx, "管理员不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      void WechatMpNotifyService.notifyHighRiskOp({
        opType: describeAdminUpdate(body),
        operator: ctx.state.admin?.username || "unknown",
        target: doc.username,
        summary: describeAdminUpdateSummary(body),
      });
      success(ctx, AdminAccountService.serializeAdminDoc(doc));
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
 * /admin/admins/{id}:
 *   delete:
 *     tags: [adminFeedbacks]
 *     summary: 删除:id
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
  "/admins/:id",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const targetDoc = await Admin.findById(ctx.params.id).lean();
      const ok = await AdminAccountService.deleteAdmin(ctx.params.id);
      if (!ok) {
        error(ctx, "管理员不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      void WechatMpNotifyService.notifyHighRiskOp({
        opType: "删除管理员",
        operator: ctx.state.admin?.username || "unknown",
        target: targetDoc?.username || String(ctx.params.id || ""),
        summary: "已删除",
      });
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

export default router;
