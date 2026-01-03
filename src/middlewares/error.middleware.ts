import { Context, Next } from "koa";
import { error, ErrorCodes } from "../utils/response";

/**
 * 全局错误处理中间件
 * 捕获所有未处理的错误，防止程序崩溃
 */
export const errorMiddleware = async (ctx: Context, next: Next) => {
  try {
    await next();

    // 处理 404 错误（如果路由没有匹配到）
    if (ctx.status === 404 && !ctx.body) {
      error(ctx, "资源不存在", ErrorCodes.NOT_FOUND, 404);
    }
  } catch (err: any) {
    // 记录错误日志
    console.error("全局错误捕获:", {
      timestamp: new Date().toISOString(),
      method: ctx.method,
      url: ctx.url,
      error: err.message,
      stack: err.stack,
      errorName: err.name,
      errorCode: err.code,
    });

    // 根据错误类型返回相应的响应
    if (err instanceof SyntaxError) {
      // JSON 解析错误
      error(
        ctx,
        "请求数据格式错误，请检查JSON格式",
        ErrorCodes.PARAM_ERROR,
        400
      );
    } else if (err.name === "ValidationError") {
      // 数据验证错误（如 Mongoose）
      const message = err.message || "数据验证失败";
      error(ctx, `数据验证失败: ${message}`, ErrorCodes.PARAM_ERROR, 400);
    } else if (err.name === "CastError") {
      // MongoDB CastError（如无效的ID格式）
      error(ctx, `参数格式错误: ${err.message}`, ErrorCodes.PARAM_ERROR, 400);
    } else if (err.code === 11000) {
      // MongoDB 重复键错误
      error(ctx, "数据已存在，请勿重复创建", ErrorCodes.ALREADY_EXISTS, 409);
    } else if (err.status && err.status >= 400 && err.status < 500) {
      // 已知的客户端错误（4xx）
      const code = err.code || ErrorCodes.PARAM_ERROR;
      const message = err.message || "客户端请求错误";
      error(ctx, message, code, err.status);
    } else {
      // 未知的服务器错误
      const message =
        process.env.NODE_ENV === "production"
          ? "服务器内部错误，请稍后重试"
          : err.message || "服务器内部错误";

      error(ctx, message, ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
};

/**
 * 创建自定义错误类，便于统一处理
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: number = ErrorCodes.INTERNAL_ERROR,
    public status: number = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * 参数错误
 */
export class ParamError extends AppError {
  constructor(message: string = "参数错误") {
    super(message, ErrorCodes.PARAM_ERROR, 400);
    this.name = "ParamError";
  }
}

/**
 * 认证错误
 */
export class AuthError extends AppError {
  constructor(message: string = "认证失败") {
    super(message, ErrorCodes.AUTH_ERROR, 401);
    this.name = "AuthError";
  }
}

/**
 * 权限错误
 */
export class PermissionError extends AppError {
  constructor(message: string = "权限不足") {
    super(message, ErrorCodes.PERMISSION_ERROR, 403);
    this.name = "PermissionError";
  }
}

/**
 * 资源不存在错误
 */
export class NotFoundError extends AppError {
  constructor(message: string = "资源不存在") {
    super(message, ErrorCodes.NOT_FOUND, 404);
    this.name = "NotFoundError";
  }
}
