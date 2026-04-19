import Router from "@koa/router";
import { success, error, ErrorCodes } from "../utils/response";
import { UserService } from "../service/user.service";
import { refreshToken, verifyToken } from "../utils/jwt";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import { z } from "zod";

const router = new Router({
  prefix: "/auth",
});

// 登录请求验证
const loginSchema = z.object({
  code: z.string().min(1, "登录凭证不能为空"),
});

// 刷新token请求验证
const refreshSchema = z.object({
  token: z.string().min(1, "Token不能为空"),
});

const updateMeProfileSchema = z
  .object({
    nickname: z.string().trim().min(1, "昵称不能为空").max(32, "昵称最多 32 字").optional(),
    avatarUrl: z.string().trim().url("头像地址格式不正确").max(1000, "头像地址过长").optional(),
    bio: z.string().trim().max(100, "简介最多 100 字").optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "至少更新一个字段",
  });

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags:
 *       - 认证
 *     summary: 用户登录
 *     description: 使用微信登录凭证进行用户登录
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: 微信登录凭证
 *                 example: "023abc123def456"
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT令牌
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: 参数验证失败
 *       500:
 *         description: 服务器内部错误
 */
router.post("/login", async (ctx) => {
  try {
    const body = loginSchema.parse(ctx.request.body);
    const result = await UserService.login(body.code);
    success(ctx, result, "登录成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("登录失败:", err);
      error(ctx, err.message || "登录失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags:
 *       - 认证
 *     summary: 刷新JWT令牌
 *     description: 使用旧的JWT令牌刷新获取新的令牌
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: 旧的JWT令牌
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: 令牌刷新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: 新的JWT令牌
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: 参数验证失败
 *       401:
 *         description: 无效的令牌或令牌无法刷新
 *       500:
 *         description: 服务器内部错误
 */
router.post("/refresh", async (ctx) => {
  try {
    const body = refreshSchema.parse(ctx.request.body);
    const oldToken = body.token;

    // 验证token是否有效（即使过期）
    const decoded = verifyToken(oldToken, true);
    if (!decoded) {
      error(ctx, "无效的Token", ErrorCodes.AUTH_ERROR, 401);
      return;
    }

    // 尝试刷新token
    const newToken = refreshToken(oldToken);
    if (!newToken) {
      error(ctx, "Token无法刷新，请重新登录", ErrorCodes.AUTH_ERROR, 401);
      return;
    }

    success(ctx, { token: newToken }, "Token刷新成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("刷新token失败:", err);
      error(
        ctx,
        err.message || "刷新token失败",
        ErrorCodes.INTERNAL_ERROR,
        500,
      );
    }
  }
});

/**
 * @swagger
 * /auth/session:
 *   post:
 *     tags:
 *       - 认证
 *     summary: 上报本地会话启动
 *     description: 客户端已持有有效 JWT、未走微信 code 登录时调用，用于记录活动日志；需 Bearer Token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 已受理（活动异步写入）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: 未认证或 Token 无效
 */
router.post("/session", authMiddleware, async (ctx: AuthContext) => {
  try {
    UserService.recordClientSession(ctx.user!.userId);
    success(ctx, { ok: true }, "已记录");
  } catch (err) {
    console.error("会话上报失败:", err);
    error(ctx, "会话上报失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/** 兼容旧客户端：聚合资料 + 统计，结构与历史版本一致 */
router.get("/me-page", authMiddleware, async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const [profile, stats] = await Promise.all([
      UserService.getMeProfile(userId),
      UserService.getMeStats(userId),
    ]);
    success(ctx, { profile, stats }, "获取我的页面信息成功");
  } catch (err) {
    console.error("获取我的页面信息失败:", err);
    const message = err instanceof Error ? err.message : "获取我的页面信息失败";
    const isUserMissing = /用户不存在/.test(message);
    error(
      ctx,
      message,
      isUserMissing ? ErrorCodes.AUTH_ERROR : ErrorCodes.INTERNAL_ERROR,
      isUserMissing ? 401 : 500,
    );
  }
});

router.get("/me-profile", authMiddleware, async (ctx: AuthContext) => {
  try {
    const data = await UserService.getMeProfile(ctx.user!.userId);
    success(ctx, data, "获取我的资料成功");
  } catch (err) {
    console.error("获取我的资料失败:", err);
    const message = err instanceof Error ? err.message : "获取我的资料失败";
    const isUserMissing = /用户不存在/.test(message);
    error(
      ctx,
      message,
      isUserMissing ? ErrorCodes.AUTH_ERROR : ErrorCodes.INTERNAL_ERROR,
      isUserMissing ? 401 : 500,
    );
  }
});

router.get("/me-stats", authMiddleware, async (ctx: AuthContext) => {
  try {
    const data = await UserService.getMeStats(ctx.user!.userId);
    success(ctx, data, "获取我的统计成功");
  } catch (err) {
    console.error("获取我的统计失败:", err);
    const message = err instanceof Error ? err.message : "获取我的统计失败";
    const isUserMissing = /用户不存在/.test(message);
    error(
      ctx,
      message,
      isUserMissing ? ErrorCodes.AUTH_ERROR : ErrorCodes.INTERNAL_ERROR,
      isUserMissing ? 401 : 500,
    );
  }
});

router.put("/me/profile", authMiddleware, async (ctx: AuthContext) => {
  try {
    const body = updateMeProfileSchema.parse(ctx.request.body || {});
    const data = await UserService.updateMeProfile(ctx.user!.userId, body);
    success(ctx, data, "更新资料成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, err.issues[0]?.message || "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    console.error("更新资料失败:", err);
    error(ctx, err.message || "更新资料失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
