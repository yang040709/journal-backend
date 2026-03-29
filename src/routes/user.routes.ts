import Router from "@koa/router";
import { success, error, ErrorCodes } from "../utils/response";
import { UserService } from "../service/user.service";
import { refreshToken, verifyToken } from "../utils/jwt";
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

export default router;
