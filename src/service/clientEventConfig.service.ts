import SystemConfig, {
  SYSTEM_CONFIG_CLIENT_EVENT_SETTINGS_KEY,
} from "../model/SystemConfig";
import {
  CLIENT_EVENT_LABELS,
  CLIENT_EVENT_NAMES,
  DEFAULT_CLIENT_EVENT_SETTINGS,
  isClientEventTrackingAllowed,
  normalizeClientEventSettings,
  type ClientEventName,
  type ClientEventSettingsPayload,
} from "../constant/clientEvent";
import { buildCacheKey, getOrSetCache, invalidateCacheByPrefix } from "../utils/cache";

const cacheKeyPrefix = buildCacheKey("system", "clientEventSettings", "v1");

async function loadRaw(): Promise<Record<string, unknown> | null> {
  const doc = await SystemConfig.findOne({
    configKey: SYSTEM_CONFIG_CLIENT_EVENT_SETTINGS_KEY,
  })
    .select("clientEventSettings")
    .lean();
  const raw = doc?.clientEventSettings;
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return null;
}

export type AdminClientEventConfigPayload = ClientEventSettingsPayload & {
  updatedAt: string | null;
  eventMeta: Array<{
    eventName: ClientEventName;
    eventLabel: string;
    enabled: boolean;
  }>;
};

export class ClientEventConfigService {
  static async ensureDocument(): Promise<void> {
    const exists = await SystemConfig.exists({
      configKey: SYSTEM_CONFIG_CLIENT_EVENT_SETTINGS_KEY,
    });
    if (!exists) {
      await SystemConfig.create({
        configKey: SYSTEM_CONFIG_CLIENT_EVENT_SETTINGS_KEY,
        coverUrls: [],
        tagNames: [],
        initialNotebookTemplates: [],
        initialNotebookCount: 0,
        clientEventSettings: normalizeClientEventSettings({}),
      });
    }
  }

  static async getNormalized(): Promise<ClientEventSettingsPayload> {
    try {
      await ClientEventConfigService.ensureDocument();
      return await getOrSetCache(cacheKeyPrefix, 300, async () => {
        const raw = await loadRaw();
        return normalizeClientEventSettings(raw ?? {});
      });
    } catch {
      return { ...DEFAULT_CLIENT_EVENT_SETTINGS };
    }
  }

  static async getForClient(): Promise<ClientEventSettingsPayload> {
    return ClientEventConfigService.getNormalized();
  }

  static async getForAdmin(): Promise<AdminClientEventConfigPayload> {
    await ClientEventConfigService.ensureDocument();
    const settings = await ClientEventConfigService.getNormalized();
    const doc = await SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_CLIENT_EVENT_SETTINGS_KEY,
    }).lean();

    return {
      ...settings,
      updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
      eventMeta: CLIENT_EVENT_NAMES.map((eventName) => ({
        eventName,
        eventLabel: CLIENT_EVENT_LABELS[eventName],
        enabled: settings.events[eventName] !== false,
      })),
    };
  }

  static async setForAdmin(
    payload: ClientEventSettingsPayload,
  ): Promise<AdminClientEventConfigPayload> {
    await ClientEventConfigService.ensureDocument();
    const next = normalizeClientEventSettings(payload);

    await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_CLIENT_EVENT_SETTINGS_KEY },
      {
        $set: { clientEventSettings: next },
        $setOnInsert: {
          configKey: SYSTEM_CONFIG_CLIENT_EVENT_SETTINGS_KEY,
          coverUrls: [],
          tagNames: [],
          initialNotebookTemplates: [],
          initialNotebookCount: 0,
        },
      },
      { upsert: true, new: true },
    );

    invalidateCacheByPrefix(cacheKeyPrefix);
    return ClientEventConfigService.getForAdmin();
  }

  static async isEventAllowed(eventName: string): Promise<boolean> {
    const settings = await ClientEventConfigService.getNormalized();
    return isClientEventTrackingAllowed(settings, eventName);
  }
}
