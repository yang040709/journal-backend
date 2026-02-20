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
    error(ctx, "获取用户快捷封面失败", ErrorCodes.INTERNAL_ERROR, 500);
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
      error(
        ctx,
        err.message || "更新用户快捷封面失败",
        ErrorCodes.INTERNAL_ERROR,
        500,
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

export default router;
