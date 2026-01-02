import Router from "@koa/router";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import {
  success,
  error,
  paginatedSuccess,
  ErrorCodes,
} from "../utils/response";
import { NoteService } from "../service/note.service";
import { z } from "zod";

const router = new Router({
  prefix: "/notes",
});

// 所有路由都需要认证
router.use(authMiddleware);

// 创建手帐请求验证
const createNoteSchema = z.object({
  noteBookId: z.string().min(1, "手帐本ID不能为空"),
  title: z.string().min(1).max(200),
  content: z.string(),
  tags: z.array(z.string()).optional().default([]),
});

// 更新手帐请求验证
const updateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  noteBookId: z.string().optional(),
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
});

// 搜索参数验证
const searchSchema = z.object({
  q: z.string().min(1, "搜索关键词不能为空"),
  noteBookId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
});

// 批量删除请求验证
const batchDeleteSchema = z.object({
  noteIds: z.array(z.string()).min(1, "至少需要提供一个手帐ID"),
});

/**
 * @route GET /notes
 * @desc 获取手帐列表
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
      "获取手帐列表成功"
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("获取手帐列表失败:", err);
      error(ctx, "获取手帐列表失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @route GET /notes/search
 * @desc 搜索手帐
 */
router.get("/search", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const params = searchSchema.parse(ctx.query);
    const notes = await NoteService.searchNotes(userId, params);

    success(ctx, notes, "搜索手帐成功");
    // success(ctx, [], "搜索手帐成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("搜索手帐失败:", err);
      error(ctx, "搜索手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @route GET /notes/:id
 * @desc 获取单个手帐
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
 * @route POST /notes
 * @desc 创建手帐
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
 * @route PUT /notes/:id
 * @desc 更新手帐
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
 * @route DELETE /notes/:id
 * @desc 删除手帐
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

    success(ctx, { deleted: true }, "删除手帐成功");
  } catch (err) {
    console.error("删除手帐失败:", err);
    error(ctx, "删除手帐失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route POST /notes/batch-delete
 * @desc 批量删除手帐
 */
router.post("/batch-delete", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = batchDeleteSchema.parse(ctx.request.body);

    const deletedCount = await NoteService.batchDeleteNotes(
      body.noteIds,
      userId
    );

    success(ctx, { deletedCount }, `成功删除 ${deletedCount} 条手帐`);
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
 * @route GET /notes/recent
 * @desc 获取最近更新的手帐
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

export default router;
