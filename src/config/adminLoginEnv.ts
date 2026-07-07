function readEnv(key: string): string {
  return String(process.env[key] ?? "").trim();
}

function readEnvFlag(key: string, defaultValue = true): boolean {
  const raw = readEnv(key);
  if (!raw) return defaultValue;
  return raw === "true" || raw === "1";
}

function readEnvInt(key: string, defaultValue: number, min: number, max: number): number {
  const raw = readEnv(key);
  if (!raw) return defaultValue;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.min(max, Math.max(min, n));
}

export type AdminLoginCaptchaStore = "mongo" | "memory" | "auto";

export function isAdminLoginCaptchaEnabled(): boolean {
  if (process.env.NODE_ENV === "test") {
    return readEnvFlag("ADMIN_LOGIN_CAPTCHA_ENABLED", true);
  }
  return readEnvFlag("ADMIN_LOGIN_CAPTCHA_ENABLED", true);
}

export function getAdminLoginCaptchaTtlSeconds(): number {
  return readEnvInt("ADMIN_LOGIN_CAPTCHA_TTL_SECONDS", 120, 30, 600);
}

export function getAdminLoginCaptchaStore(): AdminLoginCaptchaStore {
  const raw = readEnv("ADMIN_LOGIN_CAPTCHA_STORE").toLowerCase();
  if (raw === "mongo" || raw === "memory" || raw === "auto") {
    return raw;
  }
  return "auto";
}

export function getAdminLoginIpLimit(): number {
  return readEnvInt("ADMIN_LOGIN_IP_LIMIT", 10, 1, 100);
}

export function getAdminLoginUsernameLimit(): number {
  return readEnvInt("ADMIN_LOGIN_USERNAME_LIMIT", 5, 1, 100);
}

export function getAdminLoginLockFailThreshold(): number {
  return readEnvInt("ADMIN_LOGIN_LOCK_FAIL_THRESHOLD", 10, 3, 50);
}

export function getAdminLoginLockMinutes(): number {
  return readEnvInt("ADMIN_LOGIN_LOCK_MINUTES", 15, 1, 1440);
}

/** 验证码图片生成接口 IP 限流（次/分钟） */
export function getAdminLoginCaptchaCreateIpLimit(): number {
  return readEnvInt("ADMIN_LOGIN_CAPTCHA_CREATE_IP_LIMIT", 30, 5, 200);
}

export const ADMIN_LOGIN_WINDOW_MS = 60_000;
