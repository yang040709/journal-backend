import Router from "@koa/router";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import {
  success,
  error,
  paginatedSuccess,
  ErrorCodes,
} from "../utils/response";
import { ReminderService } from "../service/reminder.service";
import { z } from "zod";

const router = new Router({
  prefix: "/reminders",
});

// 所有路由都需要认证
router.use(authMiddleware);

// 创建提醒请求验证
const createReminderSchema = z.object({
  noteId: z.string().min(1, "手帐ID不能为空"),
  content: z
    .string()
    .min(1, "提醒内容不能为空")
    .max(500, "提醒内容不能超过500个字符"),
  remindTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "提醒时间格式不正确",
  }),
  title: z.string().max(200, "日程标题不能超过200个字符").optional(),
});

// 更新提醒请求验证
const updateReminderSchema = z.object({
  content: z.string().min(1).max(500).optional(),
  remindTime: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "提醒时间格式不正确",
    })
    .optional(),
  subscriptionStatus: z.enum(["pending", "subscribed", "cancelled"]).optional(),
});

// 分页参数验证
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(["pending", "subscribed", "cancelled"]).optional(),
  sendStatus: z.enum(["pending", "sent", "failed"]).optional(),
});

// 批量删除请求验证
const batchDeleteSchema = z.object({
  reminderIds: z.array(z.string()).min(1, "至少需要提供一个提醒ID"),
});

/**
 * @openapi
 * /reminders:
 *   get:
 *     tags:
 *       - reminder
 *     summary: 获取提醒列表
 *     description: 获取当前用户的提醒列表，支持分页和状态筛选
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, subscribed, cancelled]
 *         description: 订阅状态筛选
 *       - in: query
 *         name: sendStatus
 *         schema:
 *           type: string
 *           enum: [pending, sent, failed]
 *         description: 发送状态筛选
 *     responses:
 *       200:
 *         description: 获取提醒列表成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessPaginatedReminderList'
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
    const result = await ReminderService.getUserReminders(userId, params);
    paginatedSuccess(
      ctx,
      result.items,
      result.total,
      params.page,
      params.limit,
      "获取提醒列表成功"
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("获取提醒列表失败:", err);
      error(ctx, "获取提醒列表失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @openapi
 * /reminders/{id}:
 *   get:
 *     tags:
 *       - reminder
 *     summary: 获取单个提醒
 *     description: 根据ID获取单个提醒的详细信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 提醒ID
 *     responses:
 *       200:
 *         description: 获取提醒成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessReminder'
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 提醒不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const reminder = await ReminderService.getReminderById(id, userId);
    if (!reminder) {
      error(ctx, "提醒不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }

    success(ctx, reminder, "获取提醒成功");
  } catch (err) {
    console.error("获取提醒失败:", err);
    error(ctx, "获取提醒失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /reminders:
 *   post:
 *     tags:
 *       - reminder
 *     summary: 创建提醒
 *     description: 为指定手帐创建一条提醒
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - noteId
 *               - content
 *               - remindTime
 *             properties:
 *               noteId:
 *                 type: string
 *                 minLength: 1
 *                 description: 手帐ID
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *                 description: 提醒内容
 *               remindTime:
 *                 type: string
 *                 format: date-time
 *                 description: 提醒时间
 *               title:
 *                 type: string
 *                 maxLength: 200
 *                 description: 日程标题
 *     responses:
 *       200:
 *         description: 创建提醒成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessReminder'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐不存在或无权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post("/", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = createReminderSchema.parse(ctx.request.body);

    const reminder = await ReminderService.createReminder(userId, {
      ...body,
      remindTime: new Date(body.remindTime),
    });

    success(ctx, reminder, "创建提醒成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (err.message === "手帐不存在或无权访问") {
      error(ctx, err.message, ErrorCodes.NOTE_NOT_FOUND, 404);
    } else {
      console.error("创建提醒失败:", err);
      error(ctx, "创建提醒失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @openapi
 * /reminders/{id}:
 *   put:
 *     tags:
 *       - reminder
 *     summary: 更新提醒
 *     description: 根据ID更新提醒信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 提醒ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *                 description: 提醒内容
 *               remindTime:
 *                 type: string
 *                 format: date-time
 *                 description: 提醒时间
 *               subscriptionStatus:
 *                 type: string
 *                 enum: [pending, subscribed, cancelled]
 *                 description: 订阅状态
 *     responses:
 *       200:
 *         description: 更新提醒成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessReminder'
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 提醒不存在
 *       500:
 *         description: 服务器内部错误
 */
router.put("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;
    const body = updateReminderSchema.parse(ctx.request.body);

    const updateData: any = { ...body };
    if (body.remindTime) {
      updateData.remindTime = new Date(body.remindTime);
    }

    const reminder = await ReminderService.updateReminder(
      id,
      userId,
      updateData
    );
    if (!reminder) {
      error(ctx, "提醒不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }

    success(ctx, reminder, "更新提醒成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("更新提醒失败:", err);
      error(ctx, "更新提醒失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @openapi
 * /reminders/{id}:
 *   delete:
 *     tags:
 *       - reminder
 *     summary: 删除提醒
 *     description: 根据ID删除提醒
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 提醒ID
 *     responses:
 *       200:
 *         description: 删除提醒成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 提醒不存在
 *       500:
 *         description: 服务器内部错误
 */
router.delete("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const deleted = await ReminderService.deleteReminder(id, userId);
    if (!deleted) {
      error(ctx, "提醒不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }

    success(ctx, { deleted: true }, "删除提醒成功");
  } catch (err) {
    console.error("删除提醒失败:", err);
    error(ctx, "删除提醒失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /reminders/batch-delete:
 *   post:
 *     tags:
 *       - reminder
 *     summary: 批量删除提醒
 *     description: 批量删除多条提醒
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reminderIds
 *             properties:
 *               reminderIds:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                 description: 提醒ID列表
 *     responses:
 *       200:
 *         description: 批量删除提醒成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
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

    const deletedCount = await ReminderService.batchDeleteReminders(
      body.reminderIds,
      userId
    );

    success(ctx, { deletedCount }, `成功删除 ${deletedCount} 条提醒`);
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("批量删除提醒失败:", err);
      error(ctx, "批量删除提醒失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @openapi
 * /reminders/{id}/subscribe:
 *   post:
 *     tags:
 *       - reminder
 *     summary: 订阅提醒
 *     description: 将提醒的订阅状态设为 subscribed
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 提醒ID
 *     responses:
 *       200:
 *         description: 订阅提醒成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessReminder'
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 提醒不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/:id/subscribe", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const reminder = await ReminderService.updateSubscriptionStatus(
      id,
      userId,
      "subscribed"
    );
    if (!reminder) {
      error(ctx, "提醒不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }

    success(ctx, reminder, "订阅提醒成功");
  } catch (err) {
    console.error("订阅提醒失败:", err);
    error(ctx, "订阅提醒失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /reminders/{id}/cancel:
 *   post:
 *     tags:
 *       - reminder
 *     summary: 取消订阅提醒
 *     description: 将提醒的订阅状态设为 cancelled
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 提醒ID
 *     responses:
 *       200:
 *         description: 取消订阅成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessReminder'
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 提醒不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/:id/cancel", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const reminder = await ReminderService.updateSubscriptionStatus(
      id,
      userId,
      "cancelled"
    );
    if (!reminder) {
      error(ctx, "提醒不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }

    success(ctx, reminder, "取消订阅成功");
  } catch (err) {
    console.error("取消订阅失败:", err);
    error(ctx, "取消订阅失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
