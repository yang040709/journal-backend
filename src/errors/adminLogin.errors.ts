import { ErrorCodes } from "../utils/response";

export class AdminCaptchaError extends Error {
  readonly code = ErrorCodes.ADMIN_LOGIN_CAPTCHA_ERROR;

  constructor(message = "验证码错误或已过期") {
    super(message);
    this.name = "AdminCaptchaError";
  }
}

export class AdminLoginRateLimitError extends Error {
  readonly code = ErrorCodes.TOO_MANY_REQUESTS;

  constructor(message = "登录尝试过于频繁，请稍后再试") {
    super(message);
    this.name = "AdminLoginRateLimitError";
  }
}

export class AdminLoginLockedError extends Error {
  readonly code = ErrorCodes.TOO_MANY_REQUESTS;

  constructor(message: string) {
    super(message);
    this.name = "AdminLoginLockedError";
  }
}

export function isAdminLoginSecurityError(
  e: unknown,
): e is AdminCaptchaError | AdminLoginRateLimitError | AdminLoginLockedError {
  return (
    e instanceof AdminCaptchaError ||
    e instanceof AdminLoginRateLimitError ||
    e instanceof AdminLoginLockedError
  );
}
