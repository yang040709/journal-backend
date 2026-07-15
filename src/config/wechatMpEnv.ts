function readEnv(key: string): string {
  return String(process.env[key] ?? "").trim();
}

function readEnvFlag(key: string, defaultValue = true): boolean {
  const raw = readEnv(key);
  if (!raw) return defaultValue;
  return raw === "true" || raw === "1";
}

const WECHAT_MP_OPENID_PATTERN = /^o[A-Za-z0-9_-]{15,63}$/;

export function getWeChatMpAppId(): string {
  return readEnv("WECHAT_MP_APPID");
}

export function getWeChatMpSecret(): string {
  return readEnv("WECHAT_MP_SECRET");
}

export function getWeChatMpAdminOpenId(): string {
  const openid = readEnv("WECHAT_MP_ADMIN_OPENID");
  if (!openid) return "";
  return WECHAT_MP_OPENID_PATTERN.test(openid) ? openid : "";
}

export function getWeChatMpTemplateAdminLogin(): string {
  return readEnv("WECHAT_MP_TEMPLATE_ADMIN_LOGIN");
}

export function getWeChatMpTemplateAlert(): string {
  return readEnv("WECHAT_MP_TEMPLATE_ALERT");
}

export function getWeChatMpTemplateAdminOps(): string {
  return readEnv("WECHAT_MP_TEMPLATE_ADMIN_OPS");
}

export function isWeChatMpNotifyEnabled(): boolean {
  return readEnv("WECHAT_MP_NOTIFY_ENABLED") === "true";
}

export function isWeChatMpAdminLoginNotifyEnabled(): boolean {
  return isWeChatMpNotifyEnabled() && readEnvFlag("WECHAT_MP_NOTIFY_ADMIN_LOGIN", true);
}

export function isWeChatMpAlertNotifyEnabled(): boolean {
  return isWeChatMpNotifyEnabled() && readEnvFlag("WECHAT_MP_NOTIFY_ALERT", true);
}

export function isWeChatMpAdminOpsNotifyEnabled(): boolean {
  return isWeChatMpNotifyEnabled() && readEnv("WECHAT_MP_NOTIFY_ADMIN_OPS") === "true";
}

export function isWeChatMpAdminLoginFailNotifyEnabled(): boolean {
  return isWeChatMpNotifyEnabled() && readEnv("WECHAT_MP_NOTIFY_ADMIN_LOGIN_FAIL") === "true";
}

function readEnvInt(key: string, fallback: number, min: number, max: number): number {
  const raw = readEnv(key);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function getAdminLoginFailWindowMinutes(): number {
  return readEnvInt("WECHAT_MP_ADMIN_LOGIN_FAIL_WINDOW_MINUTES", 5, 1, 60);
}

export function getAdminLoginFailThreshold(): number {
  return readEnvInt("WECHAT_MP_ADMIN_LOGIN_FAIL_THRESHOLD", 5, 2, 100);
}

export function isWeChatMpConfigured(): boolean {
  return Boolean(
    getWeChatMpAppId()
    && getWeChatMpSecret()
    && getWeChatMpAdminOpenId(),
  );
}
