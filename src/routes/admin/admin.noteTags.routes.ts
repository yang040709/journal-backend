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
 * /admin/note-preset-tags:
 *   get:
 *     tags: [adminNoteTags]
 *     summary: 手帐预设标签
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
  "/note-preset-tags",
  requireAdminPage(ADMIN_PAGE_NOTE_TAGS),
  async (ctx) => {
    const data = await NotePresetTagService.getForAdmin();
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/note-preset-tags:
 *   put:
 *     tags: [adminNoteTags]
 *     summary: 更新手帐预设标签
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
  "/note-preset-tags",
  requireAdminPage(ADMIN_PAGE_NOTE_TAGS),
  async (ctx) => {
    try {
      const body = adminNotePresetTagsPutSchema.parse(ctx.request.body);
      const r = await NotePresetTagService.setTagNames(body.tags);
      success(ctx, {
        tags: r.tags,
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
