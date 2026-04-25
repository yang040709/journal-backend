import Router from "@koa/router";
import { z } from "zod";
import {
  adminAuthMiddleware,
  requireAdminPage,
  requireSuperAdmin,
} from "../middlewares/adminAuth.middleware";
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
  ADMIN_PAGE_POINTS_CAMPAIGNS,
} from "../constant/adminPages";
import {
  success,
  error,
  paginatedSuccess,
  ErrorCodes,
} from "../utils/response";
import { AdminAccountService } from "../service/adminAccount.service";
import { AdminNoteService } from "../service/adminNote.service";
import { AdminNoteBookService } from "../service/adminNoteBook.service";
import { AdminUserService } from "../service/adminUser.service";
import { AdminTemplateService } from "../service/adminTemplate.service";
import { AdminReminderService } from "../service/adminReminder.service";
import { AdminUserCoverService } from "../service/adminUserCover.service";
import { AdminStatsService } from "../service/adminStats.service";
import {
  AdminOperationsReportService,
  MAX_RANGE_DAYS,
} from "../service/adminOperationsReport.service";
import { AdminQuotaService } from "../service/adminQuota.service";
import { CoverService } from "../service/cover.service";
import User from "../model/User";
import PointsRuleChangeLog from "../model/PointsRuleChangeLog";
import { PointsService } from "../service/points.service";
import { listByUser } from "../service/userImageAsset.service";
import { NotePresetTagService } from "../service/notePresetTag.service";
import { UserNoteCustomTagService } from "../service/userNoteCustomTag.service";
import { QuotaBaseLimitsService } from "../service/quotaBaseLimits.service";
import { NoteExportSettingsService } from "../service/noteExportSettings.service";
import NoteExportLog from "../model/NoteExportLog";
import { AiStyleService } from "../service/aiStyle.service";
import { AiNoteService } from "../service/aiNote.service";
import { UserPurgeService } from "../service/userPurge.service";
import {
  MigrationBusinessError,
  UserMigrationService,
} from "../service/userMigration.service";
import {
  InitialUserNotebookConfigService,
  MAX_INITIAL_NOTEBOOK_TEMPLATES,
} from "../service/initialUserNotebookConfig.service";
import { InitialUserNoteSeedConfigService } from "../service/initialUserNoteSeedConfig.service";
import { AdminGalleryService } from "../service/adminGallery.service";
import { FeedbackService } from "../service/feedback.service";
import {
  CampaignNotFoundError,
  PointsCampaignService,
} from "../service/pointsCampaign.service";
import { AlertMetricService } from "../service/alertMetric.service";
import { AlertRuleService } from "../service/alertRule.service";
import AlertEvent from "../model/AlertEvent";

const MAX_PAGE_DEPTH = (() => {
  const raw = String(process.env.ADMIN_MAX_PAGE_DEPTH ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : 50_000;
})();
const MIN_SEARCH_LENGTH = 2;
const ADMIN_EXPORT_LIMIT = 2000;

function optionalKeywordSchema(max = 128) {
  return z.preprocess((v) => {
    if (v == null || v === "") return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
  }, z.string().min(MIN_SEARCH_LENGTH, `搜索关键词至少 ${MIN_SEARCH_LENGTH} 个字符`).max(max).optional());
}

function daySpanInclusive(startDate: string, endDate: string): number {
  const a = new Date(`${startDate}T12:00:00Z`).getTime();
  const b = new Date(`${endDate}T12:00:00Z`).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z
    .enum(["createdAt", "updatedAt", "title"])
    .optional()
    .default("updatedAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  userId: z.string().optional(),
  noteBookId: z.string().optional(),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

const tagsQuery = z.preprocess((val) => {
  if (val == null || val === "") {
    return undefined;
  }
  if (Array.isArray(val)) {
    return val.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof val === "string") {
    return val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}, z.array(z.string()).optional());

const noteListQuerySchema = paginationSchema.safeExtend({
  tags: tagsQuery,
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
  isShare: z
    .preprocess((v) => {
      if (v === undefined || v === "") return undefined;
      if (v === "true" || v === true) return true;
      if (v === "false" || v === false) return false;
      return undefined;
    }, z.boolean().optional()),
  /** 标题/正文全文检索（MongoDB $text）；与 tags 同时传时忽略 tags */
  q: optionalKeywordSchema(100),
});

const riskNoteListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().optional(),
  riskStatus: z.enum(["reject_local", "reject_wechat", "risky_wechat", "error"]).optional(),
  keyword: optionalKeywordSchema(100),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().optional(),
  /** 注册时间下限（毫秒时间戳，含该时刻起） */
  createdAtFrom: z.coerce.number().optional(),
  /** 注册时间上限（毫秒时间戳，含当日结束） */
  createdAtTo: z.coerce.number().optional(),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

/** 用户 Activity 分页：id 为 User MongoDB _id */
const userActivityQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  type: z
    .enum([
      "create",
      "update",
      "delete",
      "share_enable",
      "share_disable",
      "session",
    ])
    .optional(),
  target: z
    .enum(["noteBook", "note", "reminder", "template", "cover", "user"])
    .optional(),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

/** 全站 Activity 分页；可选 userId 为业务用户 id（与 Activity.userId 一致） */
const activityListQuerySchema = userActivityQuerySchema.safeExtend({
  userId: z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
  }, z.string().max(128).optional()),
});

const quotaDailyListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().optional(),
  dateKeyFrom: z.string().optional(),
  dateKeyTo: z.string().optional(),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

const operationsReportQuerySchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate 须为 YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate 须为 YYYY-MM-DD"),
}).refine((val) => val.startDate <= val.endDate, {
  message: "开始日期不能晚于结束日期",
  path: ["startDate"],
}).refine((val) => daySpanInclusive(val.startDate, val.endDate) <= MAX_RANGE_DAYS, {
  message: `时间跨度不能超过 ${MAX_RANGE_DAYS} 天`,
  path: ["endDate"],
});

const alertRuleUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  severity: z.enum(["P1", "P2", "P3"]).optional(),
  windowMinutes: z.number().int().min(1).max(1440).optional(),
  minSampleCount: z.number().int().min(0).max(1_000_000).optional(),
  thresholdType: z.enum(["count", "rate", "ratio_vs_baseline"]).optional(),
  thresholdValue: z.number().min(0).optional(),
  recoverValue: z.number().min(0).optional(),
  consecutiveHits: z.number().int().min(1).max(60).optional(),
  cooldownMinutes: z.number().int().min(0).max(1440).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
});

const alertRuleToggleSchema = z.object({
  enabled: z.boolean(),
});

const alertEventListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.enum(["open", "acknowledged", "resolved", "muted"]).optional(),
    severity: z.enum(["P1", "P2", "P3"]).optional(),
    ruleKey: z.string().trim().max(100).optional(),
  })
  .refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
    message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
    path: ["page"],
  });

const alertEventAckSchema = z.object({
  remark: z.string().trim().max(500).optional(),
});

const adRewardLogListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().optional(),
  rewardType: z.enum(["points"]).optional(),
  createdAtFrom: z.coerce.number().optional(),
  createdAtTo: z.coerce.number().optional(),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

const noteImageSchema = z.object({
  url: z.string().url("图片URL格式不正确"),
  key: z.string().min(1, "图片Key不能为空"),
  thumbUrl: z.string().url("缩略图URL格式不正确").optional(),
  thumbKey: z.string().min(1, "缩略图Key不能为空").optional(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  createdAt: z.coerce.date().optional(),
});

const createNoteSchema = z.object({
  noteBookId: z.string().min(1),
  title: z.string().min(1).max(200),
  content: z.string(),
  tags: z.array(z.string()).optional().default([]),
  images: z.array(noteImageSchema).max(9).optional(),
  userId: z.string().min(1, "所属用户 userId 不能为空"),
  appliedSystemTemplateKey: z.string().trim().max(120).optional(),
});

const updateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  noteBookId: z.string().optional(),
  images: z.array(noteImageSchema).max(9).optional(),
});

const createNoteBookSchema = z.object({
  title: z.string().min(1).max(100),
  coverImg: z.string().optional(),
  userId: z.string().min(1),
});

const updateNoteBookSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  coverImg: z.string().optional(),
});

const createUserSchema = z.object({
  userId: z.string().min(1),
  initDefaultNoteBooks: z.boolean().optional(),
});

const updateUserSchema = z
  .object({
    aiBonusQuota: z.number().int().min(0).optional(),
    uploadExtraQuotaTotal: z.number().int().min(0).optional(),
    points: z.number().int().min(0).optional(),
    pointsAdjustReason: z.string().trim().min(1).max(2000).optional(),
    adRewardDailyLimit: z.union([z.number().int().min(1).max(999), z.null()]).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.points !== undefined && (!val.pointsAdjustReason || !val.pointsAdjustReason.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "调整积分时必须填写原因备注",
        path: ["pointsAdjustReason"],
      });
    }
  });

const userMigrationPrecheckSchema = z.object({
  sourceOpenid: z.string().trim().min(1).max(128),
  targetOpenid: z.string().trim().min(1).max(128),
  remark: z.string().trim().min(1).max(500),
  operator: z.string().trim().min(1).max(100),
});

const userMigrationExecuteSchema = userMigrationPrecheckSchema.extend({
  idempotencyKey: z.string().trim().min(8).max(200),
});

const adminPointsRulesPutSchema = z.object({
  pointsPerAd: z.number().int().min(1).max(1_000_000).optional(),
  globalAdDailyLimit: z.number().int().min(0).max(999).optional(),
  uploadExchange: z
    .object({
      enabled: z.boolean().optional(),
      pointsCost: z.number().int().min(1).max(1_000_000).optional(),
      quotaGain: z.number().int().min(1).max(1_000_000).optional(),
    })
    .optional(),
  aiExchange: z
    .object({
      enabled: z.boolean().optional(),
      pointsCost: z.number().int().min(1).max(1_000_000).optional(),
      quotaGain: z.number().int().min(1).max(1_000_000).optional(),
    })
    .optional(),
  feedbackRewards: z
    .object({
      weeklyFirstSubmit: z.number().int().min(0).max(1_000_000).optional(),
      important: z.number().int().min(0).max(1_000_000).optional(),
      critical: z.number().int().min(0).max(1_000_000).optional(),
    })
    .optional(),
});

const feedbackListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.enum(["pending", "reviewed"]).optional(),
    reviewLevel: z.enum(["trash", "normal", "important", "critical"]).optional(),
    type: z.enum(["bug", "rant", "demand", "praise"]).optional(),
    keyword: optionalKeywordSchema(200),
    userId: z.string().trim().min(1).max(128).optional(),
  })
  .refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
    message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
    path: ["page"],
  });

const feedbackReviewBodySchema = z.object({
  reviewLevel: z.enum(["trash", "normal", "important", "critical"]),
  reviewRemark: z.string().trim().max(1000).optional(),
});

const batchIdsSchema = z
  .array(z.string().trim().min(1))
  .min(1, "至少选择一条数据")
  .max(500, "单次最多处理 500 条");

const feedbackBatchReviewBodySchema = z.object({
  ids: batchIdsSchema,
  reviewLevel: z.enum(["trash", "normal", "important", "critical"]),
  reviewRemark: z.string().trim().max(1000).optional(),
});

const feedbackExportQuerySchema = z.object({
  mode: z.enum(["selected", "filtered"]).default("filtered"),
  ids: z.string().trim().optional(),
  status: z.enum(["pending", "reviewed"]).optional(),
  reviewLevel: z.enum(["trash", "normal", "important", "critical"]).optional(),
  type: z.enum(["bug", "rant", "demand", "praise"]).optional(),
  keyword: optionalKeywordSchema(200),
  userId: z.string().trim().min(1).max(128).optional(),
});

const feedbackNextQuerySchema = z.object({
  currentId: z.string().trim().optional(),
  direction: z.enum(["next", "prev"]).optional().default("next"),
});

const adminQuotaBaseLimitsPutSchema = z
  .object({
    uploadDailyBaseLimit: z.number().int().min(0).max(999).optional(),
    aiDailyBaseLimit: z.number().int().min(0).max(999).optional(),
  })
  .refine((v) => v.uploadDailyBaseLimit !== undefined || v.aiDailyBaseLimit !== undefined, {
    message: "至少提供一个要更新的字段",
  });

const adminExportSettingsPutSchema = z
  .object({
    exportPointsPerExtra: z.number().int().min(1).max(1_000_000).optional(),
    exportWeeklyFreeCount: z.number().int().min(0).max(999).optional(),
    exportMaxNotesPerFile: z.number().int().min(1).max(2000).optional(),
    exportDefaultWindowDays: z.number().int().min(1).max(3660).optional(),
    exportMaxRangeDays: z.number().int().min(1).max(10000).optional(),
  })
  .refine(
    (v) =>
      v.exportPointsPerExtra !== undefined ||
      v.exportWeeklyFreeCount !== undefined ||
      v.exportMaxNotesPerFile !== undefined ||
      v.exportDefaultWindowDays !== undefined ||
      v.exportMaxRangeDays !== undefined,
    { message: "至少提供一个要更新的字段" },
  );

const noteExportLogQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    userId: z.string().trim().min(1).max(128).optional(),
  })
  .refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
    message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
    path: ["page"],
  });

const createAdminSchema = z.object({
  username: z.string().min(2).max(64),
  password: z.string().min(6),
  allowedPages: z.array(z.string()).optional().default([]),
});

const updateAdminSchema = z.object({
  password: z.string().min(6).optional(),
  allowedPages: z.array(z.string()).optional(),
  disabled: z.boolean().optional(),
});

const templateFieldsSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  tags: z.array(z.string()).optional().default([]),
});

const adminCreateTemplateSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(""),
  fields: templateFieldsSchema,
});

const adminUpdateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  fields: templateFieldsSchema.partial().optional(),
});

const adminSystemTemplateBodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(""),
  systemKey: z.string().min(1).max(64).optional(),
  enabled: z.boolean().optional().default(true),
  fields: templateFieldsSchema,
});

const adminUpdateSystemTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  systemKey: z.string().min(1).max(64).optional(),
  enabled: z.boolean().optional(),
  fields: templateFieldsSchema.partial().optional(),
});

const systemTemplateBatchStatusBodySchema = z.object({
  ids: batchIdsSchema,
  enabled: z.boolean(),
});

const systemTemplateExportQuerySchema = z.object({
  mode: z.enum(["selected", "filtered"]).default("filtered"),
  ids: z.string().trim().optional(),
  enabled: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v == null ? undefined : v === "true")),
  keyword: optionalKeywordSchema(100),
});

const templateListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z
    .enum(["createdAt", "updatedAt", "name"])
    .optional()
    .default("updatedAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  userId: z.string().optional(),
  search: optionalKeywordSchema(100),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

const reminderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z
    .enum(["createdAt", "updatedAt", "remindTime"])
    .optional()
    .default("remindTime"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  userId: z.string().optional(),
  noteId: z.string().optional(),
  sendStatus: z.enum(["pending", "sent", "failed"]).optional(),
  subscriptionStatus: z
    .enum(["pending", "subscribed", "cancelled"])
    .optional(),
  remindTimeFrom: z.coerce.date().optional(),
  remindTimeTo: z.coerce.date().optional(),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

const adminUpdateReminderSchema = z.object({
  content: z.string().min(1).max(500).optional(),
  remindTime: z.coerce.date().optional(),
  resetFailedToPending: z.boolean().optional(),
});

const adminQuickCoversBodySchema = z.object({
  covers: z.array(z.string()).min(1),
});

const adminSystemCoversPutSchema = z.object({
  coverUrls: z.array(z.string().min(1)).min(1, "至少一条封面 URL"),
});

const adminNotePresetTagsPutSchema = z.object({
  tags: z.array(z.string()).max(100),
});

const adminInitialNotebooksPutSchema = z.object({
  templates: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        coverImg: z.string().min(1),
        enabled: z.coerce.boolean().optional(),
      }),
    )
    .min(1)
    .max(MAX_INITIAL_NOTEBOOK_TEMPLATES),
});

const adminInitialNotesPutSchema = z.object({
  templates: z
    .array(
      z.object({
        seedKey: z.string().trim().min(1).max(120),
        targetIndex: z.coerce.number().int().min(0).max(19),
        title: z.string().trim().min(1).max(200),
        content: z.string().optional().default(""),
        tags: z.array(z.string()).optional().default([]),
        isPinned: z.coerce.boolean().optional().default(false),
      }),
    )
    .max(40),
});

const adminCustomCoverBodySchema = z.object({
  coverUrl: z.string().min(1),
  thumbUrl: z
    .union([z.string().url("缩略图URL格式不正确"), z.literal("")])
    .optional(),
  thumbKey: z.union([z.string().trim().min(1, "缩略图Key不能为空"), z.literal("")]).optional(),
});

const adminGalleryCosStsSchema = z.object({
  biz: z.enum(["system_cover"]).default("system_cover"),
  fileName: z.string().min(1).max(255),
  fileType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileSize: z.number().int().positive(),
  withThumb: z.boolean().optional(),
});

const adminGalleryRecordSchema = z.object({
  biz: z.enum(["system_cover"]).default("system_cover"),
  url: z.string().url("主图 URL 格式不正确"),
  storageKey: z.string().trim().min(1, "storageKey 不能为空"),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().nonnegative(),
  width: z.number().int().nonnegative().optional().default(0),
  height: z.number().int().nonnegative().optional().default(0),
  thumbUrl: z.string().url("缩略图 URL 格式不正确").optional(),
  thumbKey: z.string().trim().min(1, "缩略图 key 不能为空").optional(),
});

const adminGalleryListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  biz: z.enum(["system_cover"]).optional().default("system_cover"),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

const aiStyleModePromptsSchema = z.object({
  generate: z.string().optional(),
  rewrite: z.string().optional(),
  continue: z.string().optional(),
});

const aiStyleCreateSchema = z.object({
  styleKey: z.string().trim().min(2).max(64),
  name: z.string().trim().min(1).max(50),
  subtitle: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
  category: z.enum(["diary", "structured", "social"]).optional().default("diary"),
  order: z.coerce.number().int().min(0).max(9999).optional().default(100),
  enabled: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
  isRecommended: z.boolean().optional().default(false),
  systemPrompt: z.string().trim().min(1),
  userPromptTemplate: z.string().trim().min(1),
  modePrompts: aiStyleModePromptsSchema.optional().default({}),
  maxOutputChars: z.coerce.number().int().min(50).max(4000).optional(),
  emojiPolicy: z.enum(["forbid", "low", "normal"]).optional(),
  outputFormat: z.string().trim().max(200).optional().default(""),
});

const aiStyleUpdateSchema = aiStyleCreateSchema.partial();

const aiStyleEnableSchema = z.object({
  enabled: z.boolean(),
});

const aiStylePreviewSchema = z.object({
  styleKey: z.string().trim().min(2).max(64).optional(),
  mode: z.enum(["generate", "rewrite", "continue"]),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  hint: z.string().optional(),
});

const router = new Router({ prefix: "/admin" });

/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: 后台管理系统接口
 */

/**
 * @openapi
 * /admin/auth/login:
 *   post:
 *     tags: [Admin]
 *     summary: 管理员登录
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: OK
 */
router.post("/auth/login", async (ctx) => {
  try {
    const body = loginSchema.parse(ctx.request.body);
    const clientKey = ctx.ip || ctx.request.ip || "unknown";
    const result = await AdminAccountService.login(
      body.username,
      body.password,
      clientKey,
    );
    void AlertMetricService.recordOperation("login_admin", { success: true });
    success(ctx, result);
  } catch (e) {
    void AlertMetricService.recordOperation("login_admin", { success: false });
    const msg = e instanceof Error ? e.message : "登录失败";
    error(ctx, msg, ErrorCodes.USER_CREDENTIALS_ERROR, 400);
  }
});

const authed = new Router();
authed.use(adminAuthMiddleware);

/**
 * @openapi
 * /admin/auth/me:
 *   get:
 *     tags: [Admin]
 *     summary: 当前管理员信息
 *     security:
 *       - bearerAuth: []
 */
authed.get("/auth/me", async (ctx) => {
  const a = ctx.state.admin!;
  success(ctx, AdminAccountService.toPublicAdmin(a));
});

/**
 * @openapi
 * /admin/stats/overview:
 *   get:
 *     tags: [Admin]
 *     summary: 全站运营概览（仅超级管理员）
 *     security:
 *       - bearerAuth: []
 */
authed.get(
  "/stats/overview",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await AdminStatsService.getOverview();
    success(ctx, data);
  },
);

/**
 * @openapi
 * /admin/stats/operations-report:
 *   get:
 *     tags: [Admin]
 *     summary: 运营报表（时间范围，仅超级管理员）
 *     security:
 *       - bearerAuth: []
 */
authed.get(
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

authed.get("/alerts/rules", requireSuperAdmin(), async (ctx) => {
  try {
    const rules = await AlertRuleService.listRules();
    success(ctx, rules);
  } catch (e) {
    error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

authed.put("/alerts/rules/:ruleKey", requireSuperAdmin(), async (ctx) => {
  try {
    const body = alertRuleUpdateSchema.parse(ctx.request.body || {});
    const rule = await AlertRuleService.updateRuleByKey(String(ctx.params.ruleKey || ""), body);
    if (!rule) {
      error(ctx, "规则不存在", ErrorCodes.NOT_FOUND, 404);
      return;
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

authed.post("/alerts/rules/:ruleKey/toggle", requireSuperAdmin(), async (ctx) => {
  try {
    const body = alertRuleToggleSchema.parse(ctx.request.body || {});
    const rule = await AlertRuleService.toggleRule(String(ctx.params.ruleKey || ""), body.enabled);
    if (!rule) {
      error(ctx, "规则不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, rule);
  } catch (e) {
    if (e instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    error(ctx, e instanceof Error ? e.message : "操作失败", ErrorCodes.PARAM_ERROR, 400);
  }
});

authed.get("/alerts/events", requireSuperAdmin(), async (ctx) => {
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

authed.get("/alerts/events/:eventId", requireSuperAdmin(), async (ctx) => {
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

authed.post("/alerts/events/:eventId/ack", requireSuperAdmin(), async (ctx) => {
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

authed.post("/alerts/events/:eventId/resolve", requireSuperAdmin(), async (ctx) => {
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

authed.get("/alerts/metrics/overview", requireSuperAdmin(), async (ctx) => {
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

authed.get(
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

authed.get(
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

authed.get(
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

authed.get(
  "/system/covers",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await CoverService.getSystemCoversForAdmin();
    success(ctx, data);
  },
);

authed.put(
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

authed.get(
  "/system/initial-notebooks",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await InitialUserNotebookConfigService.getForAdmin();
    success(ctx, data);
  },
);

authed.put(
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

authed.get(
  "/system/initial-notes",
  requireSuperAdmin(),
  async (ctx) => {
    const data = await InitialUserNoteSeedConfigService.getForAdmin();
    success(ctx, data);
  },
);

authed.put(
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

authed.get(
  "/note-preset-tags",
  requireAdminPage(ADMIN_PAGE_NOTE_TAGS),
  async (ctx) => {
    const data = await NotePresetTagService.getForAdmin();
    success(ctx, data);
  },
);

authed.put(
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

authed.get(
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

authed.post(
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

authed.get(
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

authed.put(
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

authed.post(
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

authed.post(
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

authed.post(
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
        error(ctx, "AI 服务未配置", ErrorCodes.INTERNAL_ERROR, 500);
        return;
      }
      error(ctx, msg, ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

/** GET /admin/notes：支持 q（$text），与 tags 同时存在时服务端忽略 tags，见 AdminNoteService.listNotes */
authed.get(
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

authed.get(
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

authed.get(
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

authed.get(
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

authed.post(
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

authed.put(
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

authed.delete(
  "/notes/:id",
  requireAdminPage(ADMIN_PAGE_NOTES),
  async (ctx) => {
    const ok = await AdminNoteService.deleteNote(ctx.params.id);
    if (!ok) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }
    success(ctx, { deleted: true });
  },
);

const batchNoteIdsBodySchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1).max(50),
});

const batchTagsBodySchema = batchNoteIdsBodySchema.extend({
  tags: z.array(z.string()).max(50).default([]),
  mode: z.enum(["replace", "add"]).default("replace"),
});

const batchShareBodySchema = batchNoteIdsBodySchema.extend({
  isShare: z.boolean(),
});

authed.post(
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

authed.post(
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

authed.get(
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

authed.get(
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

authed.post(
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

authed.put(
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

authed.delete(
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

authed.get(
  "/templates/system",
  requireAdminPage(ADMIN_PAGE_TEMPLATES),
  async (ctx) => {
    const list = await AdminTemplateService.listSystemTemplates();
    success(ctx, list);
  },
);

authed.post(
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

authed.post(
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

authed.get(
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
      const header = ["模板ID", "systemKey", "名称", "描述", "状态", "更新时间"];
      const csvEscape = (value: unknown) =>
        `"${String(value ?? "").replace(/"/g, '""')}"`;
      const lines = [header.map(csvEscape).join(",")];
      for (const row of filtered) {
        lines.push(
          [
            String(row.mongoId || row.id || ""),
            String(row.systemKey || ""),
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

authed.put(
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

authed.delete(
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
 *     tags: [Admin]
 *     summary: 用户自定义模板分页列表
 *     security:
 *       - bearerAuth: []
 */
authed.get(
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

authed.get(
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

authed.post(
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

authed.put(
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

authed.delete(
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

/**
 * @openapi
 * /admin/reminders:
 *   get:
 *     tags: [Admin]
 *     summary: 用户提醒分页列表（全站）
 *     security:
 *       - bearerAuth: []
 */
authed.get(
  "/reminders",
  requireAdminPage(ADMIN_PAGE_REMINDERS),
  async (ctx) => {
    try {
      const q = reminderListQuerySchema.parse(ctx.query);
      const { items, total } = await AdminReminderService.listReminders({
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        order: q.order,
        userId: q.userId,
        noteId: q.noteId,
        sendStatus: q.sendStatus,
        subscriptionStatus: q.subscriptionStatus,
        remindTimeFrom: q.remindTimeFrom,
        remindTimeTo: q.remindTimeTo,
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

authed.get(
  "/reminders/:id",
  requireAdminPage(ADMIN_PAGE_REMINDERS),
  async (ctx) => {
    const r = await AdminReminderService.getReminderById(ctx.params.id);
    if (!r) {
      error(ctx, "提醒不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, r);
  },
);

authed.put(
  "/reminders/:id",
  requireAdminPage(ADMIN_PAGE_REMINDERS),
  async (ctx) => {
    try {
      const body = adminUpdateReminderSchema.parse(ctx.request.body);
      if (
        body.content === undefined &&
        body.remindTime === undefined &&
        !body.resetFailedToPending
      ) {
        error(ctx, "无有效更新字段", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      const doc = await AdminReminderService.updateReminder(ctx.params.id, {
        content: body.content,
        remindTime: body.remindTime,
        resetFailedToPending: body.resetFailedToPending,
      });
      if (!doc) {
        error(ctx, "提醒不存在", ErrorCodes.NOT_FOUND, 404);
        return;
      }
      const out = await AdminReminderService.getReminderById(ctx.params.id);
      success(ctx, out);
    } catch (e) {
      error(
        ctx,
        e instanceof Error ? e.message : "更新失败",
        ErrorCodes.PARAM_ERROR,
      );
    }
  },
);

authed.delete(
  "/reminders/:id",
  requireAdminPage(ADMIN_PAGE_REMINDERS),
  async (ctx) => {
    const ok = await AdminReminderService.deleteReminder(ctx.params.id);
    if (!ok) {
      error(ctx, "提醒不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, { deleted: true });
  },
);

authed.get(
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
authed.get(
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

authed.get(
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
authed.get(
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

authed.get(
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
authed.post(
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

authed.get(
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

authed.get(
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
authed.get(
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

authed.put(
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

authed.post(
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

authed.put(
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

authed.delete(
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

authed.post(
  "/gallery/cos/sts",
  requireAdminPage(ADMIN_PAGE_GALLERY),
  async (ctx) => {
    try {
      const body = adminGalleryCosStsSchema.parse(ctx.request.body);
      const data = await AdminGalleryService.createCosStsCredential({
        biz: body.biz,
        fileName: body.fileName,
        fileType: body.fileType,
        fileSize: body.fileSize,
        withThumb: body.withThumb,
      });
      success(ctx, data, "获取上传凭证成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      const msg = e instanceof Error ? e.message : "获取上传凭证失败";
      error(ctx, msg, ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

authed.post(
  "/gallery/images",
  requireAdminPage(ADMIN_PAGE_GALLERY),
  async (ctx) => {
    try {
      const body = adminGalleryRecordSchema.parse(ctx.request.body);
      const admin = ctx.state.admin!;
      const row = await AdminGalleryService.recordUploadedImage({
        biz: body.biz,
        url: body.url,
        storageKey: body.storageKey,
        mimeType: body.mimeType,
        size: body.size,
        width: body.width,
        height: body.height,
        thumbUrl: body.thumbUrl,
        thumbKey: body.thumbKey,
        createdByAdminId: String(admin.id || ""),
        createdByAdminUsername: admin.username,
      });
      success(ctx, row, "图片入库成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      const msg = e instanceof Error ? e.message : "图片入库失败";
      error(ctx, msg, ErrorCodes.PARAM_ERROR, 400);
    }
  },
);

authed.get(
  "/gallery/images",
  requireAdminPage(ADMIN_PAGE_GALLERY),
  async (ctx) => {
    try {
      const q = adminGalleryListQuerySchema.parse(ctx.query);
      const { items, total, page, limit } = await AdminGalleryService.listImages({
        page: q.page,
        limit: q.limit,
        biz: q.biz,
      });
      paginatedSuccess(ctx, items, total, page, limit, "获取图库列表成功");
    } catch (e) {
      if (e instanceof z.ZodError) {
        error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
        return;
      }
      const msg = e instanceof Error ? e.message : "获取图库列表失败";
      error(ctx, msg, ErrorCodes.INTERNAL_ERROR, 500);
    }
  },
);

authed.post(
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

authed.put(
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

authed.post(
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

authed.post(
  "/users/migration/execute",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = userMigrationExecuteSchema.parse(ctx.request.body);
      const data = await UserMigrationService.execute(body);
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

authed.get(
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

authed.get(
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

authed.get(
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

authed.put(
  "/quota/base-limits",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = adminQuotaBaseLimitsPutSchema.parse(ctx.request.body);
      await QuotaBaseLimitsService.setFromAdmin(body);
      const data = await QuotaBaseLimitsService.getForAdmin();
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

authed.get(
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

authed.put(
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

authed.get(
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

authed.put(
  "/points/rules",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = adminPointsRulesPutSchema.parse(ctx.request.body);
      const admin = ctx.state.admin!;
      const rules = await PointsService.setRulesFromAdmin(body, {
        id: admin.id,
        username: admin.username,
      });
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

const pointsRuleLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

const pointsTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  flowType: z.enum(["all", "income", "expense"]).optional().default("all"),
  bizType: z.string().trim().max(100).optional(),
  userId: z.string().trim().max(128).optional(),
  keyword: optionalKeywordSchema(128),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
}).refine((val) => val.page * val.pageSize <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*pageSize <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

const pointsCampaignCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).optional().default(""),
    pointValue: z.number().int().min(1).max(1_000_000),
    quota: z.number().int().min(1).max(10_000_000),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    successCopy: z.string().trim().max(200).optional().default("领取成功，可前往积分页查看"),
    channelRemark: z.string().trim().max(200).optional().default(""),
  })
  .refine((v) => v.startAt.getTime() < v.endAt.getTime(), {
    message: "结束时间必须晚于开始时间",
    path: ["endAt"],
  });

const pointsCampaignUpdateSchema = pointsCampaignCreateSchema.partial();

const pointsCampaignListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(["draft", "published", "offline"]).optional(),
  keyword: optionalKeywordSchema(100),
});

authed.get(
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

authed.get(
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

authed.post(
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

authed.put(
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

authed.post(
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

authed.post(
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

authed.get(
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

authed.get(
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

authed.get(
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

authed.get(
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

authed.get(
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

authed.get(
  "/feedbacks/:id",
  requireAdminPage(ADMIN_PAGE_FEEDBACKS),
  async (ctx) => {
    const row = await FeedbackService.adminGetFeedback(String(ctx.params.id || ""));
    if (!row) {
      error(ctx, "反馈不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, row);
  },
);

authed.post(
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

authed.post(
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

authed.get(
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

authed.get(
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

authed.put(
  "/feedback-config",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = z
        .object({
          weeklyFirstSubmit: z.number().int().min(0).max(1_000_000).optional(),
          important: z.number().int().min(0).max(1_000_000).optional(),
          critical: z.number().int().min(0).max(1_000_000).optional(),
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

authed.delete(
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
    success(ctx, { ...(r as any), deleted: true });
  },
);

authed.get(
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

authed.post(
  "/admins",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const body = createAdminSchema.parse(ctx.request.body);
      const doc = await AdminAccountService.createAdmin(body);
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

authed.put(
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

authed.delete(
  "/admins/:id",
  requireSuperAdmin(),
  async (ctx) => {
    try {
      const ok = await AdminAccountService.deleteAdmin(ctx.params.id);
      if (!ok) {
        error(ctx, "管理员不存在", ErrorCodes.NOT_FOUND, 404);
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

router.use(authed.routes()).use(authed.allowedMethods());

export default router;
