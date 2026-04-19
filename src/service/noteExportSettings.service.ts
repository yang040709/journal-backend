import SystemConfig, { SYSTEM_CONFIG_EXPORT_SETTINGS_KEY } from "../model/SystemConfig";

export const DEFAULT_EXPORT_SETTINGS = {
  exportPointsPerExtra: 100,
  exportWeeklyFreeCount: 3,
  exportMaxNotesPerFile: 500,
  exportDefaultWindowDays: 365,
  /** 单次时间窗最大跨度（天），防刷 */
  exportMaxRangeDays: 3660,
} as const;

export type ExportSettingsPayload = {
  exportPointsPerExtra: number;
  exportWeeklyFreeCount: number;
  exportMaxNotesPerFile: number;
  exportDefaultWindowDays: number;
  exportMaxRangeDays: number;
};

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  let x = Math.floor(v);
  if (x < min) x = min;
  if (x > max) x = max;
  return x;
}

function normalizeExportSettings(raw: unknown): ExportSettingsPayload {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    exportPointsPerExtra: clampInt(
      r.exportPointsPerExtra,
      DEFAULT_EXPORT_SETTINGS.exportPointsPerExtra,
      1,
      1_000_000,
    ),
    exportWeeklyFreeCount: clampInt(
      r.exportWeeklyFreeCount,
      DEFAULT_EXPORT_SETTINGS.exportWeeklyFreeCount,
      0,
      999,
    ),
    exportMaxNotesPerFile: clampInt(
      r.exportMaxNotesPerFile,
      DEFAULT_EXPORT_SETTINGS.exportMaxNotesPerFile,
      1,
      2000,
    ),
    exportDefaultWindowDays: clampInt(
      r.exportDefaultWindowDays,
      DEFAULT_EXPORT_SETTINGS.exportDefaultWindowDays,
      1,
      3660,
    ),
    exportMaxRangeDays: clampInt(
      r.exportMaxRangeDays,
      DEFAULT_EXPORT_SETTINGS.exportMaxRangeDays,
      1,
      10000,
    ),
  };
}

export class NoteExportSettingsService {
  static async ensureDocument(): Promise<void> {
    const exists = await SystemConfig.exists({ configKey: SYSTEM_CONFIG_EXPORT_SETTINGS_KEY });
    if (!exists) {
      await SystemConfig.create({
        configKey: SYSTEM_CONFIG_EXPORT_SETTINGS_KEY,
        coverUrls: [],
        tagNames: [],
        initialNotebookTemplates: [],
        initialNotebookCount: 0,
        exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
      });
    }
  }

  static async get(): Promise<ExportSettingsPayload> {
    await NoteExportSettingsService.ensureDocument();
    const doc = await SystemConfig.findOne({ configKey: SYSTEM_CONFIG_EXPORT_SETTINGS_KEY })
      .select("exportSettings")
      .lean();
    return normalizeExportSettings(doc?.exportSettings);
  }

  static async set(payload: Partial<ExportSettingsPayload>): Promise<ExportSettingsPayload> {
    await NoteExportSettingsService.ensureDocument();
    const prev = await NoteExportSettingsService.get();
    const next = normalizeExportSettings({ ...prev, ...payload });
    await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_EXPORT_SETTINGS_KEY },
      { $set: { exportSettings: next } },
    );
    return next;
  }
}
