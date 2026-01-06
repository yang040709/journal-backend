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
 * @route GET /reminders
 * @desc 获取提醒列表
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
 * @route GET /reminders/:id
 * @desc 获取单个提醒
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
 * @route POST /reminders
 * @desc 创建提醒
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
 * @route PUT /reminders/:id
 * @desc 更新提醒
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
 * @route DELETE /reminders/:id
 * @desc 删除提醒
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
 * @route POST /reminders/batch-delete
 * @desc 批量删除提醒
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
 * @route POST /reminders/:id/subscribe
 * @desc 订阅提醒
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
 * @route POST /reminders/:id/cancel
 * @desc 取消订阅提醒
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
