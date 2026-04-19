import Router from "@koa/router";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import { success, error, ErrorCodes } from "../utils/response";
import { CoverService } from "../service/cover.service";
import { z } from "zod";

const router = new Router({
  prefix: "/covers",
});

// 所有路由都需要认证
router.use(authMiddleware);

// 更新快捷封面请求验证
const updateQuickCoversSchema = z.object({
  covers: z.array(z.string()).min(1).max(11, "快捷封面数量必须在1到11个之间"),
});
const addCustomCoverSchema = z.object({
  coverUrl: z.string().trim().min(1, "封面地址不能为空").max(500, "封面地址过长"),
  thumbUrl: z.string().url("缩略图URL格式不正确").optional(),
  thumbKey: z.string().trim().min(1, "缩略图Key不能为空").optional(),
});
const updateCustomCoverSchema = z.object({
  coverUrl: z.string().trim().min(1, "封面地址不能为空").max(500, "封面地址过长"),
  thumbUrl: z
    .union([z.string().url("缩略图URL格式不正确"), z.literal("")])
    .optional(),
  thumbKey: z.union([z.string().trim().min(1, "缩略图Key不能为空"), z.literal("")]).optional(),
});

/**
 * @route GET /covers/system
 * @desc 获取系统默认封面列表
 */
router.get("/system", async (ctx: AuthContext) => {
  try {
    const covers = await CoverService.getSystemCovers();
    success(ctx, covers, "获取系统封面成功");
  } catch (err) {
    console.error("获取系统封面失败:", err);
    error(ctx, "获取系统封面失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /covers/quick
 * @desc 获取用户快捷封面列表
 */
router.get("/quick", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const covers = await CoverService.getUserQuickCovers(userId);
    success(ctx, covers, "获取用户快捷封面成功");
  } catch (err) {
    console.error("获取用户快捷封面失败:", err);
    const message = err instanceof Error ? err.message : "获取用户快捷封面失败";
    const isUserMissing = /用户不存在/.test(message);
    error(
      ctx,
      message,
      isUserMissing ? ErrorCodes.AUTH_ERROR : ErrorCodes.INTERNAL_ERROR,
      isUserMissing ? 401 : 500,
    );
  }
});

/**
 * @route PUT /covers/quick
 * @desc 更新用户快捷封面列表
 */
router.put("/quick", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = updateQuickCoversSchema.parse(ctx.request.body);

    const result = await CoverService.updateUserQuickCovers(userId, body);
    success(ctx, result, "更新用户快捷封面成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("更新用户快捷封面失败:", err);
      const message = err instanceof Error ? err.message : "更新用户快捷封面失败";
      const isBizError = /无效的封面地址|数量必须在|用户不存在/.test(message);
      error(
        ctx,
        message,
        isBizError ? ErrorCodes.PARAM_ERROR : ErrorCodes.INTERNAL_ERROR,
        isBizError ? 400 : 500,
      );
    }
  }
});

/**
 * @route POST /covers/quick/init
 * @desc 初始化用户快捷封面（用于旧用户迁移）
 */
router.post("/quick/init", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    await CoverService.initUserQuickCovers(userId);
    success(ctx, null, "初始化用户快捷封面成功");
  } catch (err) {
    console.error("初始化用户快捷封面失败:", err);
    error(ctx, "初始化用户快捷封面失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.get("/custom", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const covers = await CoverService.getUserCustomCovers(userId);
    success(ctx, covers, "获取用户自定义封面成功");
  } catch (err) {
    console.error("获取用户自定义封面失败:", err);
    error(ctx, "获取用户自定义封面失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.post("/custom", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = addCustomCoverSchema.parse(ctx.request.body);
    const covers = await CoverService.addUserCustomCover(userId, {
      coverUrl: body.coverUrl,
      thumbUrl: body.thumbUrl,
      thumbKey: body.thumbKey,
    });
    success(ctx, covers, "新增自定义封面成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    const message = err instanceof Error ? err.message : "新增自定义封面失败";
    const isBizError = /最多上传|不能为空|不存在/.test(message);
    error(
      ctx,
      message,
      isBizError ? ErrorCodes.PARAM_ERROR : ErrorCodes.INTERNAL_ERROR,
      isBizError ? 400 : 500,
    );
  }
});

router.put("/custom/:coverId", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { coverId } = ctx.params;
    const body = updateCustomCoverSchema.parse(ctx.request.body);
    const covers = await CoverService.updateUserCustomCover(userId, coverId, {
      coverUrl: body.coverUrl,
      thumbUrl: body.thumbUrl,
      thumbKey: body.thumbKey,
    });
    success(ctx, covers, "更新自定义封面成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    const message = err instanceof Error ? err.message : "更新自定义封面失败";
    const isBizError = /不能为空|不存在/.test(message);
    error(
      ctx,
      message,
      isBizError ? ErrorCodes.PARAM_ERROR : ErrorCodes.INTERNAL_ERROR,
      isBizError ? 400 : 500,
    );
  }
});

router.delete("/custom/:coverId", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { coverId } = ctx.params;
    const covers = await CoverService.deleteUserCustomCover(userId, coverId);
    success(ctx, covers, "删除自定义封面成功");
  } catch (err) {
    const message = err instanceof Error ? err.message : "删除自定义封面失败";
    const isBizError = /不能为空|不存在/.test(message);
    error(
      ctx,
      message,
      isBizError ? ErrorCodes.PARAM_ERROR : ErrorCodes.INTERNAL_ERROR,
      isBizError ? 400 : 500,
    );
  }
});

export default router;
