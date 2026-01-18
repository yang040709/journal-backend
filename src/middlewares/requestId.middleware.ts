import { Context, Next } from "koa";
import { nanoid } from "nanoid";

/**
 * 请求ID中间件
 * 为每个请求生成唯一ID，便于追踪请求链路
 */
export const requestIdMiddleware = async (ctx: Context, next: Next) => {
  // 从请求头获取或生成新的请求ID
  const requestId = ctx.get("X-Request-Id") || `req_${nanoid(12)}`;

  // 将请求ID存储到ctx.state，供后续中间件和路由使用
  ctx.state.requestId = requestId;

  // 将请求ID添加到响应头
  ctx.set("X-Request-Id", requestId);

  // 继续处理请求
  await next();
};

/**
 * 获取当前请求的请求ID
 * 用于在服务层或工具函数中获取请求ID
 */
export const getRequestId = (ctx: Context): string => {
  return ctx.state.requestId || "unknown";
};

/**
 * 创建请求上下文对象
 * 用于在服务层记录日志时传递请求上下文
 */
export const createRequestContext = (ctx: Context) => {
  const user = (ctx as any).user;
  return {
    requestId: getRequestId(ctx),
    userId: user?.userId || "anonymous",
    method: ctx.method,
    url: ctx.url,
    ip: ctx.ip,
    userAgent: ctx.get("User-Agent"),
  };
};

export default requestIdMiddleware;
