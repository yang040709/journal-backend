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
import { AdminOperationsReportService } from "../service/adminOperationsReport.service";
import { AdminQuotaService } from "../service/adminQuota.service";
import { CoverService } from "../service/cover.service";
import User from "../model/User";
import { listByUser } from "../service/userImageAsset.service";
import { NotePresetTagService } from "../service/notePresetTag.service";
import {
  InitialUserNotebookConfigService,
  MAX_INITIAL_NOTEBOOK_COUNT,
  MAX_INITIAL_NOTEBOOK_TEMPLATES,
} from "../service/initialUserNotebookConfig.service";

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

const noteListQuerySchema = paginationSchema.extend({
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
  q: z.preprocess((v) => {
    if (v == null || v === "") return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
  }, z.string().min(1).max(100).optional()),
});

const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().optional(),
  /** 注册时间下限（毫秒时间戳，含该时刻起） */
  createdAtFrom: z.coerce.number().optional(),
  /** 注册时间上限（毫秒时间戳，含当日结束） */
  createdAtTo: z.coerce.number().optional(),
});

const quotaDailyListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().optional(),
  dateKeyFrom: z.string().optional(),
  dateKeyTo: z.string().optional(),
});

const operationsReportQuerySchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate 须为 YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate 须为 YYYY-MM-DD"),
});

const adRewardLogListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().optional(),
  rewardType: z.enum(["upload_quota", "ai_journal_quota"]).optional(),
  createdAtFrom: z.coerce.number().optional(),
  createdAtTo: z.coerce.number().optional(),
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

const updateUserSchema = z.object({
  aiBonusQuota: z.number().int().min(0).optional(),
  uploadExtraQuotaTotal: z.number().int().min(0).optional(),
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
  fields: templateFieldsSchema,
});

const adminUpdateSystemTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  systemKey: z.string().min(1).max(64).optional(),
  fields: templateFieldsSchema.partial().optional(),
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
  search: z.string().optional(),
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
  count: z.coerce.number().int().min(1).max(MAX_INITIAL_NOTEBOOK_COUNT),
  templates: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        coverImg: z.string().min(1),
      }),
    )
    .min(1)
    .max(MAX_INITIAL_NOTEBOOK_TEMPLATES),
});

const adminCustomCoverBodySchema = z.object({
  coverUrl: z.string().min(1),
  thumbUrl: z
    .union([z.string().url("缩略图URL格式不正确"), z.literal("")])
    .optional(),
  thumbKey: z.union([z.string().trim().min(1, "缩略图Key不能为空"), z.literal("")]).optional(),
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
    success(ctx, result);
  } catch (e) {
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
        count: body.count,
      });
      success(ctx, {
        templates: r.templates,
        count: r.count,
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

authed.get(
  "/users/:id/overview",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    const data = await AdminUserService.getUserOverview(ctx.params.id);
    if (!data) {
      error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
      return;
    }
    success(ctx, data);
  },
);

authed.get(
  "/users/:id",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    const user = await AdminUserService.getUserById(ctx.params.id);
    if (!user) {
      error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
      return;
    }
    success(ctx, user);
  },
);

authed.get(
  "/users/:id/covers",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    try {
      const data = await AdminUserCoverService.getCoversPayload(ctx.params.id);
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
      const mongoId = ctx.params.id;
      const user = await User.findById(mongoId).select("userId").lean();
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

authed.put(
  "/users/:id/covers/quick",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    try {
      const body = adminQuickCoversBodySchema.parse(ctx.request.body);
      const data = await AdminUserCoverService.replaceQuickCovers(
        ctx.params.id,
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
      const body = adminCustomCoverBodySchema.parse(ctx.request.body);
      const items = await AdminUserCoverService.addCustomCover(ctx.params.id, {
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
      const body = adminCustomCoverBodySchema.parse(ctx.request.body);
      const items = await AdminUserCoverService.updateCustomCover(
        ctx.params.id,
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
      const items = await AdminUserCoverService.deleteCustomCover(
        ctx.params.id,
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
      const body = updateUserSchema.parse(ctx.request.body);
      const user = await AdminUserService.updateUser(ctx.params.id, body);
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

authed.delete(
  "/users/:id",
  requireAdminPage(ADMIN_PAGE_USERS),
  async (ctx) => {
    const ok = await AdminUserService.deleteUserById(ctx.params.id);
    if (!ok) {
      error(ctx, "用户不存在", ErrorCodes.USER_NOT_FOUND, 404);
      return;
    }
    success(ctx, { deleted: true });
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
