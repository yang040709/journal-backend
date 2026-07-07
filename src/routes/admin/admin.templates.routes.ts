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
 * /admin/templates/system:
 *   get:
 *     tags: [adminTemplates]
 *     summary: 获取system
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
  "/templates/system",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    const list = await AdminTemplateService.listSystemTemplates();
    success(ctx, list);
  },
);

/**
 * @openapi
 * /admin/templates/system:
 *   post:
 *     tags: [adminTemplates]
 *     summary: 创建system
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
  "/templates/system",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    try {
      const body = adminSystemTemplateBodySchema.parse(ctx.request.body);
      const doc = await AdminTemplateService.createSystemTemplate(body);
      success(ctx, doc);
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
 * /admin/templates/system/batch-status:
 *   post:
 *     tags: [adminTemplates]
 *     summary: 创建batch-status
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
  "/templates/system/batch-status",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    try {
      const body = systemTemplateBatchStatusBodySchema.parse(ctx.request.body);
      const result = await AdminTemplateService.batchSetSystemTemplateEnabled(
        body.ids,
        body.enabled,
      );
      console.info("[admin.templates.system.batch-status]", {
        admin: ctx.state.admin?.username,
        requestId: ctx.state.requestId,
        enabled: body.enabled,
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
      error(ctx, e instanceof Error ? e.message : "批量更新失败", ErrorCodes.PARAM_ERROR);
    }
  },
);

/**
 * @openapi
 * /admin/templates/system/export:
 *   get:
 *     tags: [adminTemplates]
 *     summary: 获取export
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
  "/templates/system/export",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    try {
      const q = systemTemplateExportQuerySchema.parse(ctx.query);
      const selectedIds = String(q.ids || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (q.mode === "selected" && selectedIds.length === 0) {
        error(ctx, "请选择要导出的数据", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      const list = await AdminTemplateService.listSystemTemplates();
      let filtered = list as Array<Record<string, unknown>>;
      if (q.mode === "selected") {
        const selectedSet = new Set(selectedIds);
        filtered = filtered.filter((row) =>
          selectedSet.has(String(row.mongoId || row.id || "")),
        );
      } else {
        if (q.enabled !== undefined) {
          filtered = filtered.filter((row) => Boolean(row.enabled ?? true) === q.enabled);
        }
        if (q.keyword?.trim()) {
          const kw = q.keyword.trim().toLowerCase();
          filtered = filtered.filter((row) =>
            `${String(row.name || "")} ${String(row.description || "")}`
              .toLowerCase()
              .includes(kw),
          );
        }
      }
      if (filtered.length > ADMIN_EXPORT_LIMIT) {
        error(
          ctx,
          `导出数量超过上限（${ADMIN_EXPORT_LIMIT}）`,
          ErrorCodes.PARAM_ERROR,
          400,
        );
        return;
      }
      filtered = [...filtered].sort((a, b) => {
        const pa = Number.isFinite(a.priority as number) ? Number(a.priority) : 100;
        const pb = Number.isFinite(b.priority as number) ? Number(b.priority) : 100;
        if (pa !== pb) return pa - pb;
        const at = new Date(String(a.updatedAt || 0)).getTime();
        const bt = new Date(String(b.updatedAt || 0)).getTime();
        if (at !== bt) return bt - at;
        return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
      });
      const header = ["模板ID", "systemKey", "优先级", "名称", "描述", "状态", "更新时间"];
      const csvEscape = (value: unknown) =>
        `"${String(value ?? "").replace(/"/g, '""')}"`;
      const lines = [header.map(csvEscape).join(",")];
      for (const row of filtered) {
        lines.push(
          [
            String(row.mongoId || row.id || ""),
            String(row.systemKey || ""),
            Number.isFinite(row.priority as number) ? String(row.priority) : "100",
            String(row.name || ""),
            String(row.description || ""),
            Boolean(row.enabled ?? true) ? "enabled" : "disabled",
            String(row.updatedAt || ""),
          ]
            .map(csvEscape)
            .join(","),
        );
      }
      console.info("[admin.templates.system.export]", {
        admin: ctx.state.admin?.username,
        requestId: ctx.state.requestId,
        mode: q.mode,
        exportedCount: filtered.length,
      });
      const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      ctx.set("Content-Type", "text/csv; charset=utf-8");
      ctx.set(
        "Content-Disposition",
        `attachment; filename="system-templates-${now}.csv"`,
      );
      ctx.body = `\uFEFF${lines.join("\n")}`;
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
 * /admin/templates/system/{id}:
 *   put:
 *     tags: [adminTemplates]
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
  "/templates/system/:id",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    try {
      const body = adminUpdateSystemTemplateSchema.parse(ctx.request.body);
      const doc = await AdminTemplateService.updateSystemTemplate(
        ctx.params.id,
        body,
      );
      if (!doc) {
        error(ctx, "系统模板不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      success(ctx, doc);
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
 * /admin/templates/system/{id}:
 *   delete:
 *     tags: [adminTemplates]
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
  "/templates/system/:id",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    const ok = await AdminTemplateService.deleteSystemTemplate(ctx.params.id);
    if (!ok) {
      error(ctx, "系统模板不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, { deleted: true });
  },
);

/**
 * @openapi
 * /admin/templates:
 *   get:
 *     tags: [adminTemplates]
 *     summary: 用户自定义模板分页列表
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
  "/templates",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    try {
      const q = templateListQuerySchema.parse(ctx.query);
      const { items, total } = await AdminTemplateService.listTemplates({
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        order: q.order,
        userId: q.userId,
        search: q.search,
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
 * /admin/templates/{id}:
 *   get:
 *     tags: [adminTemplates]
 *     summary: 模板详情
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
  "/templates/:id",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    const t = await AdminTemplateService.getTemplateById(ctx.params.id);
    if (!t) {
      error(ctx, "模板不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, t);
  },
);

/**
 * @openapi
 * /admin/templates:
 *   post:
 *     tags: [adminTemplates]
 *     summary: 创建模板
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
  "/templates",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    try {
      const body = adminCreateTemplateSchema.parse(ctx.request.body);
      const doc = await AdminTemplateService.createTemplate(body);
      success(ctx, doc);
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
 * /admin/templates/{id}:
 *   put:
 *     tags: [adminTemplates]
 *     summary: 更新模板
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
  "/templates/:id",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    try {
      const body = adminUpdateTemplateSchema.parse(ctx.request.body);
      const doc = await AdminTemplateService.updateTemplate(
        ctx.params.id,
        body,
      );
      if (!doc) {
        error(ctx, "模板不存在或不可编辑", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      success(ctx, doc);
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
 * /admin/templates/{id}:
 *   delete:
 *     tags: [adminTemplates]
 *     summary: 删除模板
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
  "/templates/:id",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    const ok = await AdminTemplateService.deleteTemplate(ctx.params.id);
    if (!ok) {
      error(ctx, "模板不存在或不可删除", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, { deleted: true });
  },
);

export default router;
