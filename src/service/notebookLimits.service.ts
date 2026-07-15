import SystemConfig, {
  SYSTEM_CONFIG_NOTEBOOK_LIMITS_KEY,
} from "../model/SystemConfig";
import { buildCacheKey, getOrSetCache, invalidateCacheByPrefix } from "../utils/cache";

export type NotebookLimitsPayload = {
  defaultMaxNoteBookCount: number;
  hardMaxNoteBookCount: number;
};

const DEFAULT_LIMITS: NotebookLimitsPayload = {
  defaultMaxNoteBookCount: 20,
  hardMaxNoteBookCount: 100,
};

const HARD_MIN = 1;
const HARD_MAX = 100;

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

/** 导出供单测：hard ∈ [1,100]，default ∈ [1, hard] */
export function normalizeNotebookLimits(raw: unknown): NotebookLimitsPayload {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const hardMaxNoteBookCount = clampInt(
    r.hardMaxNoteBookCount,
    DEFAULT_LIMITS.hardMaxNoteBookCount,
    HARD_MIN,
    HARD_MAX,
  );
  const defaultMaxNoteBookCount = clampInt(
    r.defaultMaxNoteBookCount,
    DEFAULT_LIMITS.defaultMaxNoteBookCount,
    HARD_MIN,
    hardMaxNoteBookCount,
  );
  return { defaultMaxNoteBookCount, hardMaxNoteBookCount };
}

const cacheKeyPrefix = buildCacheKey("system", "notebookLimits", "v1");

async function loadRaw(): Promise<Record<string, unknown> | null> {
  const doc = await SystemConfig.findOne({
    configKey: SYSTEM_CONFIG_NOTEBOOK_LIMITS_KEY,
  })
    .select("notebookLimits")
    .lean();
  const raw = doc?.notebookLimits;
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return null;
}

export class NotebookLimitsService {
  static async ensureDocumentExists(): Promise<void> {
    const exists = await SystemConfig.exists({
      configKey: SYSTEM_CONFIG_NOTEBOOK_LIMITS_KEY,
    });
    if (!exists) {
      await SystemConfig.create({
        configKey: SYSTEM_CONFIG_NOTEBOOK_LIMITS_KEY,
        coverUrls: [],
        tagNames: [],
        initialNotebookTemplates: [],
        initialNotebookCount: 0,
        notebookLimits: { ...DEFAULT_LIMITS },
      });
    }
  }

  static async getNotebookLimits(): Promise<NotebookLimitsPayload> {
    try {
      await NotebookLimitsService.ensureDocumentExists();
      const key = cacheKeyPrefix;
      return await getOrSetCache(key, 300, async () => {
        const raw = await loadRaw();
        return normalizeNotebookLimits(raw ?? {});
      });
    } catch {
      return { ...DEFAULT_LIMITS };
    }
  }

  /** 当前用户有效可建活本上限（本轮无用户覆盖） */
  static async getEffectiveMaxNoteBookCount(): Promise<number> {
    const limits = await NotebookLimitsService.getNotebookLimits();
    return Math.min(limits.defaultMaxNoteBookCount, limits.hardMaxNoteBookCount);
  }

  static async getForAdmin(): Promise<{
    defaultMaxNoteBookCount: number;
    hardMaxNoteBookCount: number;
    updatedAt: string | null;
  }> {
    await NotebookLimitsService.ensureDocumentExists();
    const limits = await NotebookLimitsService.getNotebookLimits();
    const doc = await SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_NOTEBOOK_LIMITS_KEY,
    }).lean();
    return {
      ...limits,
      updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
  }

  static async setFromAdmin(
    payload: Partial<NotebookLimitsPayload>,
  ): Promise<NotebookLimitsPayload> {
    await NotebookLimitsService.ensureDocumentExists();
    const prev = await NotebookLimitsService.getNotebookLimits();
    const merged: NotebookLimitsPayload = {
      defaultMaxNoteBookCount:
        payload.defaultMaxNoteBookCount ?? prev.defaultMaxNoteBookCount,
      hardMaxNoteBookCount:
        payload.hardMaxNoteBookCount ?? prev.hardMaxNoteBookCount,
    };
    const next = normalizeNotebookLimits(merged);
    await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_NOTEBOOK_LIMITS_KEY },
      {
        $set: { notebookLimits: next },
        $setOnInsert: {
          configKey: SYSTEM_CONFIG_NOTEBOOK_LIMITS_KEY,
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
