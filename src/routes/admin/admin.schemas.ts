import { z } from "zod";
import { CLIENT_EVENT_NAMES } from "../../constant/clientEvent";
import { MAX_CLIENT_EVENT_STATS_DAYS } from "../../service/adminClientEventStats.service";
import { MAX_READING_THEME_STATS_DAYS } from "../../service/adminReadingThemeStats.service";
import { MAX_RANGE_DAYS } from "../../service/adminOperationsReport.service";
import { MAX_INITIAL_NOTEBOOK_TEMPLATES } from "../../service/initialUserNotebookConfig.service";
import { optionalNoteImagesSchema } from "../../schemas/noteImage.schema";
import {
  MAX_PAGE_DEPTH,
  MIN_SEARCH_LENGTH,
  ADMIN_EXPORT_LIMIT,
  optionalKeywordSchema,
  daySpanInclusive,
} from "./admin.shared";

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  captchaId: z.string().optional(),
  captchaCode: z.string().optional(),
});

export const paginationSchema = z.object({
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

export const tagsQuery = z.preprocess((val) => {
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

export const booleanQueryParam = z.preprocess((v) => {
  if (v === undefined || v === "") return undefined;
  if (v === "true" || v === true) return true;
  if (v === "false" || v === false) return false;
  return undefined;
}, z.boolean().optional());

export const noteListQuerySchema = paginationSchema.safeExtend({
  tags: tagsQuery,
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
  isShare: booleanQueryParam,
  isFavorite: booleanQueryParam,
  isPinned: booleanQueryParam,
  /** 排除新用户初始种子手帐（欢迎/指南等）；与 noteBookId 同时传时忽略 */
  excludeDefaultNotes: booleanQueryParam,
  /** @deprecated 兼容旧参数名 excludeDefaultNotebooks */
  excludeDefaultNotebooks: booleanQueryParam,
  /** 标题/正文全文检索（MongoDB $text）；与 tags 同时传时忽略 tags */
  q: optionalKeywordSchema(100),
});

export const riskNoteListQuerySchema = z.object({
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

export const trashNoteListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().optional(),
  noteBookId: z.string().optional(),
  keyword: optionalKeywordSchema(100),
  deletedStartTime: z.coerce.number().optional(),
  deletedEndTime: z.coerce.number().optional(),
  includeExpired: booleanQueryParam,
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

export const adminRestoreTrashNoteSchema = z.object({
  targetNoteBookId: z.string().optional(),
});

export const userListQuerySchema = z.object({
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
export const userActivityQuerySchema = z.object({
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

const activityUserIdQueryPreprocess = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}, z.string().max(128).optional());

/** 全站 Activity 分页；可选 userId 为业务用户 id（与 Activity.userId 一致） */
export const activityListQuerySchema = userActivityQuerySchema.safeExtend({
  userId: activityUserIdQueryPreprocess,
});

/** 全站 Activity 类型聚合摘要；days 仅支持 7 或 30 */
export const activitySummaryQuerySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(90).optional().default(7),
    userId: activityUserIdQueryPreprocess,
    target: z
      .enum(["noteBook", "note", "reminder", "template", "cover", "user"])
      .optional(),
  })
  .refine((val) => val.days === 7 || val.days === 30, {
    message: "days 仅支持 7 或 30",
    path: ["days"],
  });

export const quotaDailyListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().optional(),
  dateKeyFrom: z.string().optional(),
  dateKeyTo: z.string().optional(),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

export const aiConsumptionLogListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().optional(),
  source: z.enum(["journal", "template"]).optional(),
  mode: z.preprocess((v) => {
    if (v == null || v === "") return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
  }, z.string().max(64).optional()),
  dateKeyFrom: z.string().optional(),
  dateKeyTo: z.string().optional(),
  createdAtFrom: z.coerce.number().optional(),
  createdAtTo: z.coerce.number().optional(),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

export const operationsReportQuerySchema = z.object({
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

export const clientEventStatsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CLIENT_EVENT_STATS_DAYS)
    .optional()
    .default(7),
  eventName: z
    .enum(CLIENT_EVENT_NAMES)
    .optional(),
});

const clientEventConfigEventsSchema = z.object(
  Object.fromEntries(
    CLIENT_EVENT_NAMES.map((name) => [name, z.boolean()]),
  ) as Record<(typeof CLIENT_EVENT_NAMES)[number], z.ZodBoolean>,
);

export const clientEventConfigUpdateSchema = z.object({
  enabled: z.boolean(),
  events: clientEventConfigEventsSchema,
});

export const readingThemeStatsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_READING_THEME_STATS_DAYS)
    .optional()
    .default(30),
});

export const alertRuleUpdateSchema = z.object({
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

export const alertRuleToggleSchema = z.object({
  enabled: z.boolean(),
});

export const alertEventListQuerySchema = z
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

export const alertEventAckSchema = z.object({
  remark: z.string().trim().max(500).optional(),
});

export const adRewardLogListQuerySchema = z.object({
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

export const createNoteSchema = z.object({
  noteBookId: z.string().min(1),
  title: z.string().min(1).max(200),
  content: z.string(),
  tags: z.array(z.string()).optional().default([]),
  images: optionalNoteImagesSchema,
  userId: z.string().min(1, "所属用户 userId 不能为空"),
  appliedSystemTemplateKey: z.string().trim().max(120).optional(),
});

export const updateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  noteBookId: z.string().optional(),
  images: optionalNoteImagesSchema,
  isShare: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  appliedSystemTemplateKey: z
    .union([z.string().trim().max(120), z.literal(""), z.null()])
    .optional(),
});

export const createNoteBookSchema = z.object({
  title: z.string().min(1).max(100),
  coverImg: z.string().optional(),
  userId: z.string().min(1),
});

export const updateNoteBookSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  coverImg: z.string().optional(),
});

export const importNotebookJsonSchema = z.object({
  userId: z.string().trim().min(1),
  titleOverride: z.string().trim().max(100).optional(),
  data: z.unknown(),
});

export const createUserSchema = z.object({
  userId: z.string().min(1),
  initDefaultNoteBooks: z.boolean().optional(),
});

export const updateUserSchema = z
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

export const userMigrationPrecheckSchema = z.object({
  sourceOpenid: z.string().trim().min(1).max(128),
  targetOpenid: z.string().trim().min(1).max(128),
  remark: z.string().trim().min(1).max(500),
  operator: z.string().trim().min(1).max(100),
});

export const userMigrationExecuteSchema = userMigrationPrecheckSchema.extend({
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const adminPointsRulesPutSchema = z.object({
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
      critical: z.number().int().min(0).max(10_000).optional(),
    })
    .optional(),
});

export const feedbackListQuerySchema = z
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

export const feedbackQuickReplyItemSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  label: z.string().trim().min(1, "标题不能为空").max(30),
  content: z.string().trim().min(1, "内容不能为空").max(1000),
  sortOrder: z.number().int().min(0).optional(),
  enabled: z.boolean().optional().default(true),
});

export const feedbackQuickRepliesBodySchema = z.object({
  items: z.array(feedbackQuickReplyItemSchema).max(50),
});

export const feedbackReviewRewardPointsSchema = z.number().int().min(0).max(10_000);

export const feedbackReviewBodySchema = z
  .object({
    reviewLevel: z.enum(["trash", "normal", "important", "critical"]),
    reviewRemark: z.string().trim().max(1000).optional(),
    userReply: z.string().trim().max(1000).optional(),
    rewardPoints: feedbackReviewRewardPointsSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.rewardPoints != null && val.reviewLevel !== "critical") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "仅「非常重要意见」可自定义奖励积分",
        path: ["rewardPoints"],
      });
    }
  });

export const batchIdsSchema = z
  .array(z.string().trim().min(1))
  .min(1, "至少选择一条数据")
  .max(500, "单次最多处理 500 条");

export const feedbackBatchReviewBodySchema = z
  .object({
    ids: batchIdsSchema,
    reviewLevel: z.enum(["trash", "normal", "important", "critical"]),
    reviewRemark: z.string().trim().max(1000).optional(),
    userReply: z.string().trim().max(1000).optional(),
    rewardPoints: feedbackReviewRewardPointsSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.rewardPoints != null && val.reviewLevel !== "critical") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "仅「非常重要意见」可自定义奖励积分",
        path: ["rewardPoints"],
      });
    }
  });

export const feedbackUserReplyBodySchema = z.object({
  userReply: z.string().trim().max(1000).optional(),
});

export const feedbackExportQuerySchema = z.object({
  mode: z.enum(["selected", "filtered"]).default("filtered"),
  ids: z.string().trim().optional(),
  status: z.enum(["pending", "reviewed"]).optional(),
  reviewLevel: z.enum(["trash", "normal", "important", "critical"]).optional(),
  type: z.enum(["bug", "rant", "demand", "praise"]).optional(),
  keyword: optionalKeywordSchema(200),
  userId: z.string().trim().min(1).max(128).optional(),
});

export const feedbackNextQuerySchema = z.object({
  currentId: z.string().trim().optional(),
  direction: z.enum(["next", "prev"]).optional().default("next"),
});

export const announcementListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.enum(["draft", "published", "offline"]).optional(),
    keyword: optionalKeywordSchema(100),
    sortBy: z.enum(["updatedAt", "createdAt", "priority", "publishedAt", "status"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
  })
  .refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
    message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
    path: ["page"],
  });

export const announcementCreateBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(20_000),
  images: z.array(z.string().trim().url("图片 URL 格式不正确")).max(30).optional().default([]),
  priority: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  showViewCount: z.boolean().optional(),
  status: z.enum(["draft", "published", "offline"]).optional(),
});

export const announcementUpdateBodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(20_000).optional(),
  images: z.array(z.string().trim().url("图片 URL 格式不正确")).max(30).optional(),
  priority: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  showViewCount: z.boolean().optional(),
});

export const adminQuotaBaseLimitsPutSchema = z
  .object({
    uploadDailyBaseLimit: z.number().int().min(0).max(999).optional(),
    aiDailyBaseLimit: z.number().int().min(0).max(999).optional(),
  })
  .refine((v) => v.uploadDailyBaseLimit !== undefined || v.aiDailyBaseLimit !== undefined, {
    message: "至少提供一个要更新的字段",
  });

export const adminExportSettingsPutSchema = z
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

export const noteExportLogQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    userId: z.string().trim().min(1).max(128).optional(),
  })
  .refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
    message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
    path: ["page"],
  });

export const createAdminSchema = z.object({
  username: z.string().min(2).max(64),
  password: z.string().min(6),
  allowedPages: z.array(z.string()).optional().default([]),
});

export const updateAdminSchema = z.object({
  password: z.string().min(6).optional(),
  allowedPages: z.array(z.string()).optional(),
  disabled: z.boolean().optional(),
});

export const templateFieldsSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  tags: z.array(z.string()).optional().default([]),
});

export const adminCreateTemplateSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(""),
  fields: templateFieldsSchema,
});

export const adminUpdateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  fields: templateFieldsSchema.partial().optional(),
});

export const adminSystemTemplateBodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(""),
  systemKey: z.string().min(1).max(64).optional(),
  enabled: z.boolean().optional().default(true),
  priority: z.coerce.number().int().min(-9999).max(9999).optional().default(100),
  fields: templateFieldsSchema,
});

export const adminUpdateSystemTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  systemKey: z.string().min(1).max(64).optional(),
  enabled: z.boolean().optional(),
  priority: z.coerce.number().int().min(-9999).max(9999).optional(),
  fields: templateFieldsSchema.partial().optional(),
});

export const systemTemplateBatchStatusBodySchema = z.object({
  ids: batchIdsSchema,
  enabled: z.boolean(),
});

export const systemTemplateExportQuerySchema = z.object({
  mode: z.enum(["selected", "filtered"]).default("filtered"),
  ids: z.string().trim().optional(),
  enabled: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v == null ? undefined : v === "true")),
  keyword: optionalKeywordSchema(100),
});

export const templateListQuerySchema = z.object({
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

export const reminderListQuerySchema = z.object({
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

export const adminUpdateReminderSchema = z.object({
  content: z.string().min(1).max(500).optional(),
  remindTime: z.coerce.date().optional(),
  resetFailedToPending: z.boolean().optional(),
});

export const adminQuickCoversBodySchema = z.object({
  covers: z.array(z.string()).min(1),
});

export const adminSystemCoversPutSchema = z.object({
  coverUrls: z.array(z.string().min(1)).min(1, "至少一条封面 URL"),
});

export const adminBrowseBannersPutSchema = z.object({
  items: z.array(
    z.object({
      imageUrl: z.string().min(1),
      type: z.enum(["none", "link", "preview_image"]),
      linkPath: z.string().optional(),
      previewImageUrl: z.string().optional(),
      priority: z.coerce.number(),
      enabled: z.coerce.boolean(),
      title: z.string().optional(),
    }),
  ),
});

export const adminNotePresetTagsPutSchema = z.object({
  tags: z.array(z.string()).max(100),
});

export const adminInitialNotebooksPutSchema = z.object({
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

export const adminInitialNotesPutSchema = z.object({
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

export const adminCustomCoverBodySchema = z.object({
  coverUrl: z.string().min(1),
  thumbUrl: z
    .union([z.string().url("缩略图URL格式不正确"), z.literal("")])
    .optional(),
  thumbKey: z.union([z.string().trim().min(1, "缩略图Key不能为空"), z.literal("")]).optional(),
});

export const adminGalleryCosStsSchema = z.object({
  biz: z.enum(["system_cover"]).default("system_cover"),
  fileName: z.string().min(1).max(255),
  fileType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileSize: z.number().int().positive(),
  withThumb: z.boolean().optional(),
});

export const adminGalleryRecordSchema = z.object({
  biz: z.enum(["system_cover"]).default("system_cover"),
  url: z.string().url("主图 URL 格式不正确"),
  storageKey: z.string().trim().min(1, "storageKey 不能为空"),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().nonnegative(),
  width: z.number().int().nonnegative().optional().default(0),
  height: z.number().int().nonnegative().optional().default(0),
  thumbUrl: z.string().url("缩略图 URL 格式不正确").optional(),
  thumbKey: z.string().trim().min(1, "缩略图 key 不能为空").optional(),
}).refine(
  (val) => (Boolean(val.thumbUrl) && Boolean(val.thumbKey)) || (!val.thumbUrl && !val.thumbKey),
  {
    message: "thumbUrl 和 thumbKey 必须同时传入或同时不传",
    path: ["thumbUrl"],
  },
);

export const adminGalleryListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  biz: z.enum(["system_cover"]).optional().default("system_cover"),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

export const adminImageAssetsListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    source: z.enum(["note", "cover"]).optional(),
    userId: z.string().trim().max(128).optional(),
  })
  .refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
    message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
    path: ["page"],
  });

export const aiStyleModePromptsSchema = z.object({
  generate: z.string().optional(),
  rewrite: z.string().optional(),
  continue: z.string().optional(),
});

export const aiStyleCreateSchema = z.object({
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

export const aiStyleUpdateSchema = aiStyleCreateSchema.partial();

export const aiStyleEnableSchema = z.object({
  enabled: z.boolean(),
});

export const aiStylePreviewSchema = z.object({
  styleKey: z.string().trim().min(2).max(64).optional(),
  mode: z.enum(["generate", "rewrite", "continue"]),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  hint: z.string().optional(),
});

export const batchNoteIdsBodySchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1).max(50),
});

export const batchTagsBodySchema = batchNoteIdsBodySchema.extend({
  tags: z.array(z.string()).max(50).default([]),
  mode: z.enum(["replace", "add"]).default("replace"),
});

export const batchShareBodySchema = batchNoteIdsBodySchema.extend({
  isShare: z.boolean(),
});

export const pointsRuleLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

export const pointsTransactionsQuerySchema = z.object({
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

export const pointsCampaignCreateSchema = z
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

export const pointsCampaignUpdateSchema = pointsCampaignCreateSchema.partial();

export const pointsCampaignListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(["draft", "published", "offline"]).optional(),
  keyword: optionalKeywordSchema(100),
});

export const adminReviewListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.enum(["on", "off"]).optional(),
  })
  .refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
    message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
    path: ["page"],
  });

export const adminReviewCreateSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  username: z.string().trim().min(1).max(64),
  tag: z.string().trim().max(64).optional().default(""),
  imageUrl: z.string().trim().max(2048).optional().default(""),
  status: z.enum(["on", "off"]).optional().default("on"),
  sortOrder: z.coerce.number().int().min(-999999).max(999999).optional().default(0),
});

export const adminReviewUpdateSchema = z.object({
  content: z.string().trim().min(1).max(1000).optional(),
  username: z.string().trim().min(1).max(64).optional(),
  tag: z.string().trim().max(64).optional(),
  imageUrl: z.string().trim().max(2048).optional(),
  status: z.enum(["on", "off"]).optional(),
  sortOrder: z.coerce.number().int().min(-999999).max(999999).optional(),
});
