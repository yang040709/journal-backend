import { Context } from "koa";

/**
 * 成功响应格式
 */
export interface SuccessResponse<T = any> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

/**
 * 错误响应格式
 */
export interface ErrorResponse {
  code: number;
  message: string;
  data: null;
  timestamp: number;
}

/**
 * 创建成功响应
 */
export const success = <T = any>(
  ctx: Context,
  data: T,
  message: string = "success",
  code: number = 0
): void => {
  ctx.body = {
    code,
    message,
    data,
    timestamp: Date.now(),
  };
};

/**
 * 创建错误响应
 */
export const error = (
  ctx: Context,
  message: string,
  code: number = 9999,
  status: number = 400
): void => {
  ctx.status = status;
  ctx.body = {
    code,
    message,
    data: null,
    timestamp: Date.now(),
  };
};

/**
 * 创建分页响应
 */
export interface PaginatedResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const paginatedSuccess = <T = any>(
  ctx: Context,
  items: T[],
  total: number,
  page: number,
  limit: number,
  message: string = "success"
): void => {
  const totalPages = Math.ceil(total / limit);

  ctx.body = {
    code: 0,
    message,
    data: {
      items,
      total,
      page,
      limit,
      totalPages,
    },
    timestamp: Date.now(),
  };
};

/**
 * 错误码常量
 */
export const ErrorCodes = {
  // 通用错误
  PARAM_ERROR: 1001,
  AUTH_ERROR: 1002,
  PERMISSION_ERROR: 1003,
  NOT_FOUND: 1004,
  ALREADY_EXISTS: 1005,
  UNAUTHORIZED: 1006,
  IMPORT_ERROR: 1007,

  // 手帐本错误
  NOTEBOOK_NOT_FOUND: 2001,

  // 手帐错误
  NOTE_NOT_FOUND: 2002,

  // 用户错误
  USER_CREDENTIALS_ERROR: 3001,
  USER_ALREADY_EXISTS: 3002,
  USER_NOT_FOUND: 3003,

  // 服务器错误
  INTERNAL_ERROR: 9999,
} as const;
