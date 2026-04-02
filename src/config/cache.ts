const DEFAULT_CACHE_ENABLED = true;
const DEFAULT_USER_STATS_TTL_SECONDS = 45;
const DEFAULT_HEAVY_STATS_TTL_SECONDS = 120;
const DEFAULT_ADMIN_REPORT_TTL_SECONDS = 240;

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const value = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function readNumberEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

export const CACHE_CONFIG = {
  enabled: readBooleanEnv("CACHE_ENABLED", DEFAULT_CACHE_ENABLED),
  stats: {
    userTtlSeconds: readNumberEnv(
      "CACHE_STATS_USER_TTL_SECONDS",
      DEFAULT_USER_STATS_TTL_SECONDS,
      5,
      3600,
    ),
    heavyTtlSeconds: readNumberEnv(
      "CACHE_STATS_HEAVY_TTL_SECONDS",
      DEFAULT_HEAVY_STATS_TTL_SECONDS,
      5,
      3600,
    ),
  },
  admin: {
    operationsReportTtlSeconds: readNumberEnv(
      "CACHE_ADMIN_OPERATIONS_REPORT_TTL_SECONDS",
      DEFAULT_ADMIN_REPORT_TTL_SECONDS,
      10,
      7200,
    ),
  },
} as const;

