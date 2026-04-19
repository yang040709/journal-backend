import { Context, Next } from "koa";
import jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
import User from "../model/User";

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is not defined. 请检查您的环境变量设置。"
  );
}

const JWT_SECRET = process.env.JWT_SECRET;

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
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    ctx.user = decoded;

    // Token 有效但用户不存在：通常是清库/换环境/老 token 导致，按登录态失效处理
    const userExists = await User.exists({ userId: decoded.userId });
    if (!userExists) {
      ctx.status = 401;
      ctx.body = {
        code: 1002,
        message: "认证失败：用户不存在，请重新登录",
        data: null,
      };
      return;
    }

    await next();
  } catch (error) {
    console.error("JWT验证失败:", error);

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
      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
      ctx.user = decoded;
    } catch (error) {
      // Token无效，但不阻止请求继续
      console.warn("可选认证：Token验证失败", error);
    }
  }

  await next();
};
