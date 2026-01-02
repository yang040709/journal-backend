import Router from "@koa/router";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import {
  success,
  error,
  paginatedSuccess,
  ErrorCodes,
} from "../utils/response";
import { NoteBookService } from "../service/noteBook.service";
import { z } from "zod";

const router = new Router({
  prefix: "/note-books",
});

// 所有路由都需要认证
router.use(authMiddleware);

// 创建手帐本请求验证
const createNoteBookSchema = z.object({
  title: z.string().min(1).max(100),
  coverImg: z.string().optional(),
});

// 更新手帐本请求验证
const updateNoteBookSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  coverImg: z.string().optional(),
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
});

/**
 * @route GET /note-books
 * @desc 获取手帐本列表
 */
router.get("/", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const params = paginationSchema.parse(ctx.query);

    const result = await NoteBookService.getUserNoteBooks(userId, params);

    paginatedSuccess(
      ctx,
      result.items,
      result.total,
      params.page,
      params.limit,
      "获取手帐本列表成功"
    );
  } catch (err) {
    console.error("获取手帐本列表失败:", err);
    error(ctx, "获取手帐本列表失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /note-books/:id
 * @desc 获取单个手帐本
 */
router.get("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const noteBook = await NoteBookService.getNoteBookById(id, userId);
    if (!noteBook) {
      error(ctx, "手帐本不存在", ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
      return;
    }
    success(ctx, noteBook, "获取手帐本成功");
  } catch (err) {
    console.error("获取手帐本失败:", err);
    error(ctx, "获取手帐本失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route POST /note-books
 * @desc 创建手帐本
 */
router.post("/", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = createNoteBookSchema.parse(ctx.request.body);

    const noteBook = await NoteBookService.createNoteBook({
      title: body.title,
      coverImg: body.coverImg,
      userId,
    });

    success(ctx, noteBook, "创建手帐本成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("创建手帐本失败:", err);
      error(ctx, "创建手帐本失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @route PUT /note-books/:id
 * @desc 更新手帐本
 */
router.put("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;
    const body = updateNoteBookSchema.parse(ctx.request.body);

    const noteBook = await NoteBookService.updateNoteBook(id, userId, body);
    if (!noteBook) {
      error(ctx, "手帐本不存在", ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
      return;
    }

    success(ctx, noteBook, "更新手帐本成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("更新手帐本失败:", err);
      error(ctx, "更新手帐本失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @route DELETE /note-books/:id
 * @desc 删除手帐本
 */
router.delete("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const deleted = await NoteBookService.deleteNoteBook(id, userId);
    if (!deleted) {
      error(ctx, "手帐本不存在", ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
      return;
    }

    success(ctx, { deleted: true }, "删除手帐本成功");
  } catch (err) {
    console.error("删除手帐本失败:", err);
    error(ctx, "删除手帐本失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /note-books/:id/stats
 * @desc 获取手帐本统计
 */
router.get("/:id/stats", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const stats = await NoteBookService.getNoteBookStats(id, userId);
    if (!stats) {
      error(ctx, "手帐本不存在", ErrorCodes.NOTEBOOK_NOT_FOUND, 404);
      return;
    }

    success(ctx, stats, "获取手帐本统计成功");
  } catch (err) {
    console.error("获取手帐本统计失败:", err);
    error(ctx, "获取手帐本统计失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
