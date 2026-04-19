import SystemConfig, {
  SYSTEM_CONFIG_QUOTA_BASE_LIMITS_KEY,
} from "../model/SystemConfig";
import { buildCacheKey, getOrSetCache, invalidateCacheByPrefix } from "../utils/cache";

export type QuotaBaseLimitsPayload = {
  uploadDailyBaseLimit: number;
  aiDailyBaseLimit: number;
};

const DEFAULT_LIMITS: QuotaBaseLimitsPayload = {
  uploadDailyBaseLimit: 9,
  aiDailyBaseLimit: 10,
};

const LIMITS_MIN = 0;
const LIMITS_MAX = 999;

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

function normalize(raw: unknown): QuotaBaseLimitsPayload {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    uploadDailyBaseLimit: clampInt(
      r.uploadDailyBaseLimit,
      DEFAULT_LIMITS.uploadDailyBaseLimit,
      LIMITS_MIN,
      LIMITS_MAX,
    ),
    aiDailyBaseLimit: clampInt(
      r.aiDailyBaseLimit,
      DEFAULT_LIMITS.aiDailyBaseLimit,
      LIMITS_MIN,
      LIMITS_MAX,
    ),
  };
}

const cacheKeyPrefix = buildCacheKey("system", "quotaBaseLimits", "v1");

async function loadRaw(): Promise<Record<string, unknown> | null> {
  const doc = await SystemConfig.findOne({
    configKey: SYSTEM_CONFIG_QUOTA_BASE_LIMITS_KEY,
  })
    .select("quotaBaseLimits")
    .lean();
  const raw = doc?.quotaBaseLimits;
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return null;
}

export class QuotaBaseLimitsService {
  static async ensureDocumentExists(): Promise<void> {
    const exists = await SystemConfig.exists({
      configKey: SYSTEM_CONFIG_QUOTA_BASE_LIMITS_KEY,
    });
    if (!exists) {
      await SystemConfig.create({
        configKey: SYSTEM_CONFIG_QUOTA_BASE_LIMITS_KEY,
        coverUrls: [],
        tagNames: [],
        initialNotebookTemplates: [],
        initialNotebookCount: 0,
        quotaBaseLimits: { ...DEFAULT_LIMITS },
      });
    }
  }

  static async getQuotaBaseLimits(): Promise<QuotaBaseLimitsPayload> {
    try {
      await QuotaBaseLimitsService.ensureDocumentExists();
      const key = cacheKeyPrefix;
      return await getOrSetCache(key, 300, async () => {
        const raw = await loadRaw();
        return normalize(raw ?? {});
      });
    } catch {
      return { ...DEFAULT_LIMITS };
    }
  }

  static async getForAdmin(): Promise<{
    uploadDailyBaseLimit: number;
    aiDailyBaseLimit: number;
    updatedAt: string | null;
  }> {
    await QuotaBaseLimitsService.ensureDocumentExists();
    const limits = await QuotaBaseLimitsService.getQuotaBaseLimits();
    const doc = await SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_QUOTA_BASE_LIMITS_KEY,
    }).lean();
    return {
      ...limits,
      updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
  }

  static async setFromAdmin(
    payload: Partial<QuotaBaseLimitsPayload>,
  ): Promise<QuotaBaseLimitsPayload> {
    await QuotaBaseLimitsService.ensureDocumentExists();
    const prev = await QuotaBaseLimitsService.getQuotaBaseLimits();
    const merged: QuotaBaseLimitsPayload = {
      uploadDailyBaseLimit: payload.uploadDailyBaseLimit ?? prev.uploadDailyBaseLimit,
      aiDailyBaseLimit: payload.aiDailyBaseLimit ?? prev.aiDailyBaseLimit,
    };
    const next = normalize(merged);
    await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_QUOTA_BASE_LIMITS_KEY },
      {
        $set: { quotaBaseLimits: next },
        $setOnInsert: {
          configKey: SYSTEM_CONFIG_QUOTA_BASE_LIMITS_KEY,
          coverUrls: [],
          tagNames: [],
          initialNotebookTemplates: [],
          initialNotebookCount: 0,
        },
      },
      { upsert: true, new: true },
    );
    invalidateCacheByPrefix(cacheKeyPrefix);
    return next;
  }
}

