import { Context, Next } from "koa";

/**
 * 计算是否允许该 Origin，并返回应回显的 Access-Control-Allow-Origin（须与请求 Origin 完全一致才能带 Cookie）
 */
function resolveAllowedOrigin(requestOrigin: string): string | null {
  if (!requestOrigin) {
    return null;
  }

  const explicit =
    process.env.ADMIN_CORS_ORIGIN?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  if (explicit.length > 0) {
    return explicit.includes(requestOrigin) ? requestOrigin : null;
  }

  // 开发环境未配置时：允许本机任意端口（避免 Vite 占用 5173 后自动改用 5174 等导致联调失败）
  if (process.env.NODE_ENV !== "production") {
    try {
      const u = new URL(requestOrigin);
      if (
        (u.protocol === "http:" || u.protocol === "https:") &&
        (u.hostname === "localhost" || u.hostname === "127.0.0.1")
      ) {
        return requestOrigin;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Admin 前端跨域：生产环境请在 .env 中设置 ADMIN_CORS_ORIGIN（支持逗号分隔多个）
 */
export const adminCorsMiddleware = async (ctx: Context, next: Next) => {
  const origin = ctx.get("Origin");
  const allow = resolveAllowedOrigin(origin);

  if (allow) {
    ctx.set("Access-Control-Allow-Origin", allow);
    ctx.set("Access-Control-Allow-Credentials", "true");
    ctx.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With",
    );
    ctx.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
  }

  if (ctx.method === "OPTIONS") {
    ctx.status = 204;
    return;
  }

  await next();
};
