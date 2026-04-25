function readEnv(key: string): string {
  return String(process.env[key] ?? "").trim();
}

export function getWeChatAppId(): string {
  return readEnv("WX_APPID");
}

/**
 * Backward-compat alias:
 * - `WX_SECRET` is the canonical env var in this repo.
 * - `WX_SE` is accepted as an alias to reduce misconfiguration.
 */
export function getWeChatSecret(): string {
  return readEnv("WX_SECRET") || readEnv("WX_SE");
}

export function isWeChatConfigured(): boolean {
  return Boolean(getWeChatAppId() && getWeChatSecret());
}

