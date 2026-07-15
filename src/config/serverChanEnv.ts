function readEnv(key: string): string {
  return String(process.env[key] ?? "").trim();
}

function readEnvFlag(key: string, defaultValue = true): boolean {
  const raw = readEnv(key);
  if (!raw) return defaultValue;
  return raw === "true" || raw === "1";
}

const SERVERCHAN_SENDKEY_PATTERN = /^SCT[A-Za-z0-9]{8,128}$/;

export function getServerChanSendKey(): string {
  const sendKey = readEnv("SERVERCHAN_SENDKEY");
  if (!sendKey) return "";
  return SERVERCHAN_SENDKEY_PATTERN.test(sendKey) ? sendKey : "";
}

export function getServerChanChannel(): string {
  return readEnv("SERVERCHAN_CHANNEL");
}

export function isServerChanNotifyEnabled(): boolean {
  return readEnv("SERVERCHAN_NOTIFY_ENABLED") === "true";
}

export function isServerChanAdminLoginNotifyEnabled(): boolean {
  return isServerChanNotifyEnabled()
    && readEnvFlag("SERVERCHAN_NOTIFY_ADMIN_LOGIN", true);
}

export function isServerChanConfigured(): boolean {
  return Boolean(getServerChanSendKey());
}

export function isServerChanAdminLoginEnabled(): boolean {
  return isServerChanAdminLoginNotifyEnabled() && isServerChanConfigured();
}
