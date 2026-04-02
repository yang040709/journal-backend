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
 * @swagger
 * /note-books:
 *   get:
 *     tags:
 *       - 手帐本管理
 *     summary: 获取手帐本列表
 *     description: 获取当前用户的手帐本列表，支持分页和排序
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
 *     responses:
 *       200:
 *         description: 获取手帐本列表成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/NoteBook'
 *                 total:
 *                   type: integer
 *                   description: 总记录数
 *                 page:
 *                   type: integer
 *                   description: 当前页码
 *                 limit:
 *                   type: integer
 *                   description: 每页数量
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
      "获取手帐本列表成功",
    );
  } catch (err) {
    console.error("获取手帐本列表失败:", err);
    error(ctx, "获取手帐本列表失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @swagger
 * /note-books/{id}:
 *   get:
 *     tags:
 *       - 手帐本管理
 *     summary: 获取单个手帐本
 *     description: 根据ID获取单个手帐本的详细信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐本ID
 *     responses:
 *       200:
 *         description: 获取手帐本成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NoteBook'
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐本不存在
 *       500:
 *         description: 服务器内部错误
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
 * @swagger
 * /note-books:
 *   post:
 *     tags:
 *       - 手帐本管理
 *     summary: 创建手帐本
 *     description: 创建一个新的手帐本
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 description: 手帐本标题
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: "我的日记本"
 *               coverImg:
 *                 type: string
 *                 description: 封面图片URL
 *                 example: "https://example.com/cover.jpg"
 *     responses:
 *       200:
 *         description: 创建手帐本成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NoteBook'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @swagger
 * /note-books/{id}:
 *   put:
 *     tags:
 *       - 手帐本管理
 *     summary: 更新手帐本
 *     description: 根据ID更新手帐本信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐本ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: 手帐本标题
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: "更新后的标题"
 *               coverImg:
 *                 type: string
 *                 description: 封面图片URL
 *                 example: "https://example.com/new-cover.jpg"
 *     responses:
 *       200:
 *         description: 更新手帐本成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NoteBook'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐本不存在
 *       500:
 *         description: 服务器内部错误
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
 * @swagger
 * /note-books/{id}:
 *   delete:
 *     tags:
 *       - 手帐本管理
 *     summary: 删除手帐本
 *     description: 根据ID删除手帐本
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐本ID
 *     responses:
 *       200:
 *         description: 删除手帐本成功
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
 *         description: 手帐本不存在
 *       500:
 *         description: 服务器内部错误
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

    success(ctx, { deleted: true }, "手帐本已删除，手帐本内的手帐已移入废纸篓");
  } catch (err) {
    console.error("删除手帐本失败:", err);
    error(ctx, "删除手帐本失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @swagger
 * /note-books/{id}/stats:
 *   get:
 *     tags:
 *       - 手帐本管理
 *     summary: 获取手帐本统计
 *     description: 获取手帐本的统计信息，如笔记数量、最近更新等
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐本ID
 *     responses:
 *       200:
 *         description: 获取手帐本统计成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 noteCount:
 *                   type: integer
 *                   description: 笔记数量
 *                 lastUpdated:
 *                   type: string
 *                   format: date-time
 *                   description: 最后更新时间
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   description: 创建时间
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐本不存在
 *       500:
 *         description: 服务器内部错误
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
