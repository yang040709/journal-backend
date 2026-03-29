import { Context, Next } from "koa";
import jwt from "jsonwebtoken";
import Admin, { AdminRole } from "../model/Admin";
import { verifyAdminToken } from "../utils/adminJwt";
import { ErrorCodes, error } from "../utils/response";
import {
  ADMIN_PAGE_ADMINS,
  ASSIGNABLE_ADMIN_PAGES,
} from "../constant/adminPages";

export interface AdminState {
  id: string;
  username: string;
  role: AdminRole;
  allowedPages: string[];
}

export interface AdminAuthContext extends Context {
  state: Context["state"] & { admin?: AdminState };
}

/**
 * 管理员 JWT 鉴权：校验后从数据库加载最新角色与权限
 */
export const adminAuthMiddleware = async (ctx: AdminAuthContext, next: Next) => {
  const authHeader = ctx.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    error(
      ctx,
      "认证失败：缺少或无效的 Token",
      ErrorCodes.AUTH_ERROR,
      401,
    );
    return;
  }

  const token = authHeader.substring(7);
  try {
    const { adminId } = verifyAdminToken(token);
    const doc = await Admin.findById(adminId).lean();
    if (!doc || doc.disabled) {
      error(ctx, "认证失败：管理员不存在或已禁用", ErrorCodes.AUTH_ERROR, 401);
      return;
    }
    ctx.state.admin = {
      id: doc._id.toString(),
      username: doc.username,
      role: doc.role,
      allowedPages: doc.allowedPages || [],
    };
    await next();
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) {
      error(ctx, "认证失败：Token 已过期", ErrorCodes.AUTH_ERROR, 401);
      return;
    }
    if (e instanceof jwt.JsonWebTokenError) {
      error(ctx, "认证失败：无效的 Token", ErrorCodes.AUTH_ERROR, 401);
      return;
    }
    error(ctx, "认证失败", ErrorCodes.AUTH_ERROR, 401);
  }
};

function superHasAllPages(): string[] {
  return [...ASSIGNABLE_ADMIN_PAGES, ADMIN_PAGE_ADMINS];
}

/** 登录响应用：当前管理员可见页面 key 列表 */
export function getEffectiveAllowedPages(admin: AdminState): string[] {
  if (admin.role === "super") {
    return superHasAllPages();
  }
  return admin.allowedPages;
}

/**
 * 普通管理员需具备对应页面 key；超级管理员直接通过
 */
export function requireAdminPage(pageKey: string) {
  return async (ctx: AdminAuthContext, next: Next) => {
    const admin = ctx.state.admin;
    if (!admin) {
      error(ctx, "未认证", ErrorCodes.AUTH_ERROR, 401);
      return;
    }
    if (admin.role === "super") {
      await next();
      return;
    }
    if (admin.allowedPages.includes(pageKey)) {
      await next();
      return;
    }
    error(ctx, "无权限访问该功能", ErrorCodes.PERMISSION_ERROR, 403);
  };
}

export function requireSuperAdmin() {
  return async (ctx: AdminAuthContext, next: Next) => {
    const admin = ctx.state.admin;
    if (!admin) {
      error(ctx, "未认证", ErrorCodes.AUTH_ERROR, 401);
      return;
    }
    if (admin.role !== "super") {
      error(ctx, "需要超级管理员权限", ErrorCodes.PERMISSION_ERROR, 403);
      return;
    }
    await next();
  };
}
