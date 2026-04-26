import { Context, Next } from "koa";
import jwt from "jsonwebtoken";
import User from "../model/User";
import logger from "../utils/logger";
import { ErrorCodes } from "../utils/response";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable is not defined. 请检查您的环境变量设置。",
    );
  }
  return secret;
}

export interface AuthUser {
  userId: string;
}

export interface AuthContext extends Context {
  user?: AuthUser;
}

/**
 * JWT认证中间件
 * 验证Authorization头中的Bearer Token
 */
export const authMiddleware = async (ctx: AuthContext, next: Next) => {
  const authHeader = ctx.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    ctx.status = 401;
    ctx.body = {
      code: 1002,
      message: "认证失败：缺少或无效的Token",
      data: null,
    };
    return;
  }

  const token = authHeader.substring(7); // 移除"Bearer "前缀

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUser;
    ctx.user = decoded;

    // Token 有效但用户不存在：通常是清库/换环境/老 token 导致，按登录态失效处理。
    // 为兼容老客户端自动清登录态逻辑，保持 AUTH_ERROR(1002)。
    const userExists = await User.exists({ userId: decoded.userId });
    if (!userExists) {
      ctx.status = 401;
      ctx.body = {
        code: ErrorCodes.AUTH_ERROR,
        message: "认证失败：用户不存在，请重新登录",
        data: null,
      };
      return;
    }

    await next();
  } catch (error) {
    logger.warn("JWT验证失败", {
      requestId: ctx.state.requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof jwt.TokenExpiredError) {
      ctx.status = 401;
      ctx.body = {
        code: 1002,
        message: "认证失败：Token已过期",
        data: null,
      };
    } else if (error instanceof jwt.JsonWebTokenError) {
      ctx.status = 401;
      ctx.body = {
        code: 1002,
        message: "认证失败：无效的Token",
        data: null,
      };
    } else {
      ctx.status = 401;
      ctx.body = {
        code: 1002,
        message: "认证失败",
        data: null,
      };
    }
  }
};

/**
 * 可选认证中间件
 * 如果提供了有效的Token，会设置ctx.user，但不强制要求认证
 */
export const optionalAuthMiddleware = async (ctx: AuthContext, next: Next) => {
  const authHeader = ctx.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, getJwtSecret()) as AuthUser;
      const userExists = await User.exists({ userId: decoded.userId });
      if (userExists) {
        ctx.user = decoded;
      } else {
        logger.debug("可选认证：token 对应用户不存在，忽略登录态", {
          requestId: ctx.state.requestId,
          userId: decoded.userId,
        });
      }
    } catch (error) {
      logger.debug("可选认证：Token验证失败", {
        requestId: ctx.state.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await next();
};
