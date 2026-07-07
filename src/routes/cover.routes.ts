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
 * @openapi
 * /covers/system:
 *   get:
 *     tags:
 *       - cover
 *     summary: 获取系统默认封面列表
 *     description: 返回系统配置的默认封面 URL 列表
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取系统封面成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessArray'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /covers/quick:
 *   get:
 *     tags:
 *       - cover
 *     summary: 获取用户快捷封面列表
 *     description: 返回当前用户的快捷封面 URL 列表；未设置时返回系统默认前 11 个
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取用户快捷封面成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessArray'
 *       401:
 *         description: 未授权访问或用户不存在
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /covers/quick:
 *   put:
 *     tags:
 *       - cover
 *     summary: 更新用户快捷封面列表
 *     description: 设置用户快捷封面，数量 1–11，URL 须为系统封面或用户自定义封面
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - covers
 *             properties:
 *               covers:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 11
 *                 items:
 *                   type: string
 *                 description: 封面 URL 数组
 *     responses:
 *       200:
 *         description: 更新用户快捷封面成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       400:
 *         description: 参数验证失败或封面地址无效
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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
 * @openapi
 * /covers/quick/init:
 *   post:
 *     tags:
 *       - cover
 *     summary: 初始化用户快捷封面
 *     description: 将用户快捷封面重置为系统默认前 11 个，用于旧用户迁移
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 初始化用户快捷封面成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessGeneric'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
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

/**
 * @openapi
 * /covers/custom:
 *   get:
 *     tags:
 *       - cover
 *     summary: 获取用户自定义封面列表
 *     description: 返回当前用户上传的自定义封面列表
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取用户自定义封面成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessArray'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
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

/**
 * @openapi
 * /covers/custom:
 *   post:
 *     tags:
 *       - cover
 *     summary: 新增用户自定义封面
 *     description: 上传并添加一条自定义封面，返回更新后的完整列表
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - coverUrl
 *             properties:
 *               coverUrl:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *                 description: 封面主图 URL
 *               thumbUrl:
 *                 type: string
 *                 format: uri
 *                 description: 缩略图 URL（可选）
 *               thumbKey:
 *                 type: string
 *                 description: 缩略图 COS Key（可选）
 *     responses:
 *       200:
 *         description: 新增自定义封面成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessArray'
 *       400:
 *         description: 参数验证失败或超出数量上限
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
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

/**
 * @openapi
 * /covers/custom/{coverId}:
 *   put:
 *     tags:
 *       - cover
 *     summary: 更新用户自定义封面
 *     description: 修改指定自定义封面的 URL 或缩略图，返回更新后的完整列表
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: coverId
 *         required: true
 *         schema:
 *           type: string
 *         description: 自定义封面 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - coverUrl
 *             properties:
 *               coverUrl:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *                 description: 封面主图 URL
 *               thumbUrl:
 *                 type: string
 *                 format: uri
 *                 description: 缩略图 URL，传空字符串可清除
 *               thumbKey:
 *                 type: string
 *                 description: 缩略图 COS Key，传空字符串可清除
 *     responses:
 *       200:
 *         description: 更新自定义封面成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessArray'
 *       400:
 *         description: 参数验证失败或封面不存在
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
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

/**
 * @openapi
 * /covers/custom/{coverId}:
 *   delete:
 *     tags:
 *       - cover
 *     summary: 删除用户自定义封面
 *     description: 删除指定自定义封面，返回更新后的完整列表
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: coverId
 *         required: true
 *         schema:
 *           type: string
 *         description: 自定义封面 ID
 *     responses:
 *       200:
 *         description: 删除自定义封面成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessArray'
 *       400:
 *         description: 封面不存在
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
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
