import Router from "@koa/router";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import {
  success,
  error,
  paginatedSuccess,
  ErrorCodes,
} from "../utils/response";
import { NoteService } from "../service/note.service";
import { AiNoteService } from "../service/aiNote.service";
import { AiStyleService } from "../service/aiStyle.service";
import { z } from "zod";
import { NotePresetTagService } from "../service/notePresetTag.service";
import { UserNoteCustomTagService } from "../service/userNoteCustomTag.service";

const MAX_PAGE_DEPTH = 10_000;
const MIN_SEARCH_KEYWORD_LENGTH = 1;

function hasAllowedPageDepth(page: number, limit: number): boolean {
  return page * limit <= MAX_PAGE_DEPTH;
}

const router = new Router({
  prefix: "/notes",
});

// 所有路由都需要认证
router.use(authMiddleware);

const presetTagsQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((val) => (typeof val === "string" ? val.trim() : "")),
});

function filterTagsByKeyword(tags: string[], keyword: string): string[] {
  if (!keyword) return tags;
  const lowerKeyword = keyword.toLocaleLowerCase();
  return tags.filter((tag) => {
    if (!tag) return false;
    return (
      tag.includes(keyword) || tag.toLocaleLowerCase().includes(lowerKeyword)
    );
  });
}

function isGuardrailError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  return err.message.includes("分页深度超过限制") || err.message.includes("搜索关键词至少");
}

/**
 * @swagger
 * /notes/preset-tags:
 *   get:
 *     tags:
 *       - 手帐管理
 *     summary: 获取可选标签（系统预设 + 当前用户自定义）
 *     description: data.tags 为合并去重后的可选列表；data.systemTags、data.customTags 分区展示用
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: 标签关键字（按包含关系过滤，忽略大小写）
 *     responses:
 *       200:
 *         description: 成功
 */
/**
 * 获取可选标签：系统预设 + 当前用户自定义合并为 tags；可通过 q 关键字过滤
 */
router.get("/preset-tags", async (ctx: AuthContext) => {
  try {
    const query = presetTagsQuerySchema.parse(ctx.query);
    const userId = ctx.user!.userId;
    const systemTags = await NotePresetTagService.getTagNames();
    const customTags = await UserNoteCustomTagService.list(userId);
    const tags = filterTagsByKeyword(
      UserNoteCustomTagService.mergeSelectableTags(systemTags, customTags),
      query.q,
    );
    success(
      ctx,
      {
        tags,
        systemTags: filterTagsByKeyword(systemTags, query.q),
        customTags: filterTagsByKeyword(customTags, query.q),
      },
      "获取预设标签成功",
    );
  } catch (err) {
    console.error("获取预设标签失败:", err);
    error(ctx, "获取预设标签失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

const addCustomTagSchema = z.object({
  name: z.string().min(1, "标签名称不能为空"),
});

/**
 * @swagger
 * /notes/custom-tags:
 *   post:
 *     tags:
 *       - 手帐管理
 *     summary: 新增自定义标签
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: 成功；data 含 customTags、tags（合并）
 *   delete:
 *     tags:
 *       - 手帐管理
 *     summary: 删除自定义标签
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: 标签名称
 *     responses:
 *       200:
 *         description: 成功
 */
/**
 * 新增自定义标签（最多 12 个，且不可与系统预设同名）
 */
router.post("/custom-tags", async (ctx: AuthContext) => {
  try {
    const body = addCustomTagSchema.parse(ctx.request.body);
    const userId = ctx.user!.userId;
    const customTags = await UserNoteCustomTagService.add(userId, body.name);
    const systemTags = await NotePresetTagService.getTagNames();
    const tags = UserNoteCustomTagService.mergeSelectableTags(
      systemTags,
      customTags,
    );
    success(ctx, { customTags, tags }, "添加自定义标签成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    const msg = err instanceof Error ? err.message : "添加失败";
    console.error("添加自定义标签失败:", err);
    error(ctx, msg, ErrorCodes.PARAM_ERROR, 400);
  }
});

/**
 * 删除自定义标签（query: name=标签名）
 */
router.delete("/custom-tags", async (ctx: AuthContext) => {
  try {
    const q = z.object({ name: z.string().min(1, "标签名称不能为空") }).parse({
      name:
        typeof ctx.query.name === "string"
          ? ctx.query.name
          : Array.isArray(ctx.query.name)
            ? ctx.query.name[0]
            : "",
    });
    const userId = ctx.user!.userId;
    const customTags = await UserNoteCustomTagService.remove(userId, q.name);
    const systemTags = await NotePresetTagService.getTagNames();
    const tags = UserNoteCustomTagService.mergeSelectableTags(
      systemTags,
      customTags,
    );
    success(ctx, { customTags, tags }, "删除自定义标签成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    const msg = err instanceof Error ? err.message : "删除失败";
    console.error("删除自定义标签失败:", err);
    error(ctx, msg, ErrorCodes.PARAM_ERROR, 400);
  }
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

// 创建手帐请求验证
const createNoteSchema = z.object({
  noteBookId: z.string().min(1, "手帐本ID不能为空"),
  title: z.string().min(1).max(200),
  content: z.string(),
  tags: z.array(z.string()).optional().default([]),
  images: z.array(noteImageSchema).max(9, "最多上传9张图片").optional(),
  appliedSystemTemplateKey: z.string().trim().max(120).optional(),
});

// 更新手帐请求验证
const updateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  noteBookId: z.string().optional(),
  images: z.array(noteImageSchema).max(9, "最多上传9张图片").optional(),
});

// 分页参数验证
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z
    .enum(["createdAt", "updatedAt", "title"])
    .optional()
    .default("updatedAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  noteBookId: z.string().optional(),
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val;
      return [val];
    }),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
}).refine((val) => hasAllowedPageDepth(val.page, val.limit), {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

// 搜索参数验证（分页规则与 paginationSchema 一致）
const searchSchema = z.object({
  q: z.string().trim().min(MIN_SEARCH_KEYWORD_LENGTH, `搜索关键词至少 ${MIN_SEARCH_KEYWORD_LENGTH} 个字符`),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  noteBookId: z.string().optional(),
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val;
      return [val];
    }),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
}).refine((val) => hasAllowedPageDepth(val.page, val.limit), {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

/** 旧版客户端：GET /notes/search，data 为数组；单次最多 100 条，无分页元数据 */
const searchLegacySchema = z.object({
  q: z.string().trim().min(MIN_SEARCH_KEYWORD_LENGTH, `搜索关键词至少 ${MIN_SEARCH_KEYWORD_LENGTH} 个字符`),
  limit: z.coerce.number().int().min(1).max(100).optional().default(100),
  noteBookId: z.string().optional(),
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val;
      return [val];
    }),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
});

// 批量删除请求验证
const batchDeleteSchema = z.object({
  noteIds: z.array(z.string()).min(1, "至少需要提供一个手帐ID"),
});
const restoreNoteSchema = z.object({
  targetNoteBookId: z.string().optional(),
});

// AI 写手帐
const aiGenerateSchema = z.object({
  mode: z.enum(["generate", "rewrite", "continue"]),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  hint: z.string().optional(),
  styleKey: z.string().trim().max(64).optional(),
});

router.get("/ai/styles", async (ctx: AuthContext) => {
  try {
    const data = await AiStyleService.listEnabledForClient();
    success(ctx, data, "ok");
  } catch (err) {
    console.error("获取 AI 风格列表失败:", err);
    error(ctx, "获取 AI 风格列表失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @swagger
 * /notes:
 *   get:
 *     tags:
 *       - 手帐管理
 *     summary: 获取手帐列表
 *     description: 获取当前用户的手帐列表，支持分页、排序、筛选和标签过滤
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: 每页数量
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, title]
 *           default: updatedAt
 *         description: 排序字段
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: 排序方向
 *       - in: query
 *         name: noteBookId
 *         schema:
 *           type: string
 *         description: 手帐本ID筛选
 *       - in: query
 *         name: tags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: 标签筛选（支持多个标签）
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: integer
 *         description: 开始时间戳（毫秒）
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: integer
 *         description: 结束时间戳（毫秒）
 *     responses:
 *       200:
 *         description: 获取手帐列表成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Note'
 *                 total:
 *                   type: integer
 *                   description: 总记录数
 *                 page:
 *                   type: integer
 *                   description: 当前页码
 *                 limit:
 *                   type: integer
 *                   description: 每页数量
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const params = paginationSchema.parse(ctx.query);
    const result = await NoteService.getNotes(userId, params);
    paginatedSuccess(
      ctx,
      result.items,
      result.total,
      params.page,
      params.limit,
      "获取手帐列表成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (isGuardrailError(err)) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("获取手帐列表失败:", err);
      error(ctx, "获取手帐列表失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

router.get("/trash", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const params = paginationSchema.parse(ctx.query);
    const result = await NoteService.getTrashNotes(userId, params);
    paginatedSuccess(
      ctx,
      result.items,
      result.total,
      params.page,
      params.limit,
      "获取废纸篓手帐成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (isGuardrailError(err)) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    console.error("获取废纸篓手帐失败:", err);
    error(ctx, "获取废纸篓手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @swagger
 * /notes/search/page:
 *   get:
 *     tags:
 *       - 手帐管理
 *     summary: 搜索手帐（分页，新版客户端）
 *     description: 根据关键词搜索手帐，返回分页结构（与 GET /notes 一致）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: 每页数量
 *       - in: query
 *         name: noteBookId
 *         schema:
 *           type: string
 *         description: 手帐本ID筛选
 *       - in: query
 *         name: tags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: 标签筛选
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: integer
 *         description: 开始时间戳（毫秒）
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: integer
 *         description: 结束时间戳（毫秒）
 *     responses:
 *       200:
 *         description: 搜索手帐成功（分页）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Note'
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/search/page", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const params = searchSchema.parse(ctx.query);
    const result = await NoteService.searchNotes(userId, params);

    paginatedSuccess(
      ctx,
      result.items,
      result.total,
      params.page,
      params.limit,
      "搜索手帐成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (isGuardrailError(err)) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("搜索手帐失败:", err);
      error(ctx, "搜索手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @swagger
 * /notes/search:
 *   get:
 *     tags:
 *       - 手帐管理
 *     summary: 搜索手帐（兼容旧版客户端）
 *     description: data 为手帐数组（非分页对象）；单次最多返回 100 条，详见 limit
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 100
 *         description: 本次最多返回条数
 *       - in: query
 *         name: noteBookId
 *         schema:
 *           type: string
 *         description: 手帐本ID筛选
 *       - in: query
 *         name: tags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: 标签筛选
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: integer
 *         description: 开始时间戳（毫秒）
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: integer
 *         description: 结束时间戳（毫秒）
 *     responses:
 *       200:
 *         description: 搜索手帐成功（数组）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Note'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/search", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const legacy = searchLegacySchema.parse(ctx.query);
    const result = await NoteService.searchNotes(userId, {
      q: legacy.q,
      page: 1,
      limit: legacy.limit,
      noteBookId: legacy.noteBookId,
      tags: legacy.tags,
      startTime: legacy.startTime,
      endTime: legacy.endTime,
    });

    success(ctx, result.items, "搜索手帐成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (isGuardrailError(err)) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("搜索手帐失败:", err);
      error(ctx, "搜索手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

router.get("/:id/trash-detail", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;
    const note = await NoteService.getTrashNoteById(id, userId);
    if (!note) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }
    success(ctx, note, "获取废纸篓手帐成功");
  } catch (err) {
    console.error("获取废纸篓手帐失败:", err);
    error(ctx, "获取废纸篓手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @swagger
 * /notes/ai/generate:
 *   post:
 *     tags:
 *       - 手帐管理
 *     summary: AI 写手帐
 *     description: 使用 DeepSeek 生成、改写或续写手帐正文；每用户每日有次数限制
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mode
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [generate, rewrite, continue]
 *                 description: generate=从零生成；rewrite=改写润色；continue=接续写作
 *               title:
 *                 type: string
 *                 description: 手帐标题（mode=generate 时必填）
 *               content:
 *                 type: string
 *                 description: 当前正文（rewrite/continue 时必填）
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               hint:
 *                 type: string
 *                 description: 用户补充说明或改写/续写方向
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     text:
 *                       type: string
 *                     remainingToday:
 *                       type: integer
 *       400:
 *         description: 参数错误或前置条件不满足
 *       401:
 *         description: 未授权
 *       429:
 *         description: 今日 AI 次数已用完
 *       500:
 *         description: 服务不可用或内部错误
 */
router.post("/ai/generate", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = aiGenerateSchema.parse(ctx.request.body);
    const result = await AiNoteService.generate({
      userId,
      mode: body.mode,
      title: body.title,
      content: body.content,
      tags: body.tags,
      hint: body.hint,
      styleKey: body.styleKey,
    });
    success(ctx, result, "ok");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    const message = err instanceof Error ? err.message : "AI 生成失败";
    const code =
      err instanceof Error && (err as Error & { code?: string }).code === "AI_DAILY_LIMIT_EXCEEDED"
        ? ErrorCodes.AI_DAILY_LIMIT_EXCEEDED
        : undefined;
    if (code === ErrorCodes.AI_DAILY_LIMIT_EXCEEDED) {
      error(ctx, message, ErrorCodes.AI_DAILY_LIMIT_EXCEEDED, 429);
      return;
    }
    if (message === "AI service not configured") {
      error(ctx, "AI 服务未配置", ErrorCodes.INTERNAL_ERROR, 500);
      return;
    }
    if (
      message === "请先填写手帐标题" ||
      message === "请先填写手帐正文"
    ) {
      error(ctx, message, ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    console.error("AI 写手帐失败:", err);
    error(ctx, message || "AI 生成失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @swagger
 * /notes/ai/quota:
 *   get:
 *     tags:
 *       - 手帐管理
 *     summary: 查询今日 AI 写手帐剩余次数
 *     description: 不扣减次数，仅查询当日剩余可用次数（含 0）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     remainingToday:
 *                       type: integer
 *       401:
 *         description: 未授权
 *       500:
 *         description: 服务器内部错误
 */
router.get("/ai/quota", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const result = await AiNoteService.getQuotaSummary(userId);
    success(ctx, result, "ok");
  } catch (err) {
    console.error("查询 AI 额度失败:", err);
    error(ctx, "查询 AI 额度失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @swagger
 * /notes/{id}:
 *   get:
 *     tags:
 *       - 手帐管理
 *     summary: 获取单个手帐
 *     description: 根据ID获取单个手帐的详细信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐ID
 *     responses:
 *       200:
 *         description: 获取手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Note'
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const note = await NoteService.getNoteById(id, userId);
    if (!note) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }

    success(ctx, note, "获取手帐成功");
  } catch (err) {
    console.error("获取手帐失败:", err);
    error(ctx, "获取手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @swagger
 * /notes:
 *   post:
 *     tags:
 *       - 手帐管理
 *     summary: 创建手帐
 *     description: 创建一个新的手帐
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - noteBookId
 *               - title
 *               - content
 *             properties:
 *               noteBookId:
 *                 type: string
 *                 description: 手帐本ID
 *                 example: "67a1b2c3d4e5f6a7b8c9d0e1"
 *               title:
 *                 type: string
 *                 description: 手帐标题
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: "今天的心情"
 *               content:
 *                 type: string
 *                 description: 手帐内容
 *                 example: "今天天气很好，心情愉快..."
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 标签列表
 *                 example: ["心情", "日记"]
 *     responses:
 *       200:
 *         description: 创建手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Note'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐本不存在或无权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post("/", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = createNoteSchema.parse(ctx.request.body);

    const note = await NoteService.createNote({
      ...body,
      userId,
    });

    success(ctx, note, "创建手帐成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (err.message === "手帐本不存在或无权访问") {
      error(ctx, err.message, ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
    } else {
      console.error("创建手帐失败:", err);
      error(ctx, "创建手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @swagger
 * /notes/{id}:
 *   put:
 *     tags:
 *       - 手帐管理
 *     summary: 更新手帐
 *     description: 根据ID更新手帐信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: 手帐标题
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: "更新后的标题"
 *               content:
 *                 type: string
 *                 description: 手帐内容
 *                 example: "更新后的内容..."
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 标签列表
 *                 example: ["更新", "修改"]
 *               noteBookId:
 *                 type: string
 *                 description: 目标手帐本ID
 *                 example: "67a1b2c3d4e5f6a7b8c9d0e1"
 *     responses:
 *       200:
 *         description: 更新手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Note'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐不存在或目标手帐本不存在
 *       500:
 *         description: 服务器内部错误
 */
router.put("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;
    const body = updateNoteSchema.parse(ctx.request.body);

    const note = await NoteService.updateNote(id, userId, body);
    if (!note) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }

    success(ctx, note, "更新手帐成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (err.message === "目标手帐本不存在或无权访问") {
      error(ctx, err.message, ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
    } else {
      console.error("更新手帐失败:", err);
      error(ctx, "更新手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @swagger
 * /notes/{id}:
 *   delete:
 *     tags:
 *       - 手帐管理
 *     summary: 删除手帐
 *     description: 根据ID删除手帐
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐ID
 *     responses:
 *       200:
 *         description: 删除手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐不存在
 *       500:
 *         description: 服务器内部错误
 */
router.delete("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const deleted = await NoteService.deleteNote(id, userId);
    if (!deleted) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }

    success(ctx, { deleted: true }, "已移入废纸篓");
  } catch (err) {
    console.error("删除手帐失败:", err);
    error(ctx, "删除手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.post("/:id/restore", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;
    const body = restoreNoteSchema.parse(ctx.request.body || {});
    const restored = await NoteService.restoreNote(id, userId, body.targetNoteBookId);
    if (!restored) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }
    success(
      ctx,
      {
        note: restored.note,
        restoredToNoteBookId: restored.restoredToNoteBookId,
        restoredToNoteBookTitle: restored.restoredToNoteBookTitle,
      },
      "恢复手帐成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (err instanceof Error && err.message === "目标手帐本不存在或已删除") {
      error(ctx, err.message, ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
      return;
    }
    console.error("恢复手帐失败:", err);
    error(ctx, "恢复手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.delete("/:id/purge", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;
    const deleted = await NoteService.purgeNote(id, userId);
    if (!deleted) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }
    success(ctx, { deleted: true }, "彻底删除成功");
  } catch (err) {
    console.error("彻底删除手帐失败:", err);
    error(ctx, "彻底删除手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @swagger
 * /notes/batch-delete:
 *   post:
 *     tags:
 *       - 手帐管理
 *     summary: 批量删除手帐
 *     description: 批量删除多个手帐
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - noteIds
 *             properties:
 *               noteIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 手帐ID列表
 *                 example: ["67a1b2c3d4e5f6a7b8c9d0e1", "67a1b2c3d4e5f6a7b8c9d0e2"]
 *     responses:
 *       200:
 *         description: 批量删除手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deletedCount:
 *                   type: integer
 *                   description: 成功删除的数量
 *                   example: 2
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post("/batch-delete", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = batchDeleteSchema.parse(ctx.request.body);

    const deletedCount = await NoteService.batchDeleteNotes(
      body.noteIds,
      userId,
    );

    success(ctx, { deletedCount }, `已移入废纸篓 ${deletedCount} 条手帐`);
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("批量删除手帐失败:", err);
      error(ctx, "批量删除手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @swagger
 * /notes/recent:
 *   get:
 *     tags:
 *       - 手帐管理
 *     summary: 获取最近更新的手帐
 *     description: 获取当前用户最近更新的手帐列表
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: 返回数量限制
 *     responses:
 *       200:
 *         description: 获取最近手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Note'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/recent", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(10)
      .parse(ctx.query.limit);
    const notes = await NoteService.getRecentNotes(userId, limit);
    success(ctx, notes, "获取最近手帐成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("获取最近手帐失败:", err);
      error(ctx, "获取最近手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @swagger
 * /notes/{id}/share-info:
 *   get:
 *     tags:
 *       - 手帐管理
 *     summary: 获取手帐的分享信息
 *     description: 获取手帐的分享状态、分享ID和分享链接等信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐ID
 *     responses:
 *       200:
 *         description: 获取分享信息成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: 手帐ID
 *                 isShare:
 *                   type: boolean
 *                   description: 是否已分享
 *                 shareId:
 *                   type: string
 *                   description: 分享ID（如果已分享）
 *                 title:
 *                   type: string
 *                   description: 手帐标题
 *                 shareUrl:
 *                   type: string
 *                   nullable: true
 *                   description: 分享链接（如果已分享）
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/:id/share-info", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const note = await NoteService.getNoteById(id, userId);
    if (!note) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }

    success(
      ctx,
      {
        id: note.id,
        isShare: note.isShare,
        shareId: note.shareId,
        title: note.title,
        shareUrl: note.shareId
          ? `/share/pages/share-note/share-note?share_id=${note.shareId}`
          : null,
      },
      "获取分享信息成功",
    );
  } catch (err) {
    console.error("获取分享信息失败:", err);
    error(ctx, "获取分享信息失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
