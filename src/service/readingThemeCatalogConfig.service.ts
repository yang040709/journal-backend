import SystemConfig, {
  SYSTEM_CONFIG_READING_THEME_CATALOG_KEY,
  type ReadingThemeManifestSnapshot,
} from "../model/SystemConfig";
import {
  buildReadingThemeManifest,
  getManifestThemeIdsByStyle,
  type ReadingThemeManifestStyle,
} from "../constant/readingThemeManifest";
import {
  buildDefaultReadingThemeCatalog,
  mergeSystemCatalogWithManifest,
  parseReadingThemeCatalogFromUser,
  appendNewManifestStylesToUserCatalog,
  readingThemeCatalogsEqual,
  validateReadingThemeCatalogInput,
  type ReadingThemeCatalog,
} from "../utils/readingThemeCatalog";

export type AdminReadingThemeCatalogResponse = {
  catalog: ReadingThemeCatalog;
  manifest: ReadingThemeManifestStyle[];
  updatedAt: string | null;
};

type LoadedConfigDoc = {
  readingThemeCatalog?: unknown;
  readingThemeManifestSnapshot?: unknown;
  updatedAt?: Date;
};

export class ReadingThemeCatalogConfigService {
  static async ensureDocument(): Promise<void> {
    const exists = await SystemConfig.exists({
      configKey: SYSTEM_CONFIG_READING_THEME_CATALOG_KEY,
    });
    if (!exists) {
      const manifestSnapshot = getManifestThemeIdsByStyle();
      await SystemConfig.create({
        configKey: SYSTEM_CONFIG_READING_THEME_CATALOG_KEY,
        coverUrls: [],
        tagNames: [],
        initialNotebookTemplates: [],
        initialNotebookCount: 0,
        readingThemeCatalog: buildDefaultReadingThemeCatalog(),
        readingThemeManifestSnapshot: manifestSnapshot,
      });
    }
  }

  private static async loadConfigDoc(): Promise<LoadedConfigDoc | null> {
    await ReadingThemeCatalogConfigService.ensureDocument();
    return SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_READING_THEME_CATALOG_KEY,
    })
      .select("readingThemeCatalog readingThemeManifestSnapshot updatedAt")
      .lean();
  }

  private static parseManifestSnapshot(
    raw: unknown,
  ): ReadingThemeManifestSnapshot | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }
    return raw as ReadingThemeManifestSnapshot;
  }

  private static buildMergedCatalog(
    storedRaw: unknown,
    snapshotRaw: unknown,
  ): ReadingThemeCatalog {
    const stored = parseReadingThemeCatalogFromUser(storedRaw);
    const snapshot = ReadingThemeCatalogConfigService.parseManifestSnapshot(snapshotRaw);
    return mergeSystemCatalogWithManifest(
      stored,
      getManifestThemeIdsByStyle(),
      snapshot,
    );
  }

  private static snapshotNeedsManifestSync(
    snapshot: Record<string, readonly string[]> | null,
    manifestIds: Record<string, readonly string[]>,
  ): boolean {
    if (!snapshot) return true;
    for (const styleKey of Object.keys(manifestIds)) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, styleKey)) {
        return true;
      }
    }
    return false;
  }

  private static async persistSystemCatalogIfNeeded(
    stored: ReadingThemeCatalog | null,
    merged: ReadingThemeCatalog,
    snapshot: Record<string, readonly string[]> | null,
    manifestIds: Record<string, readonly string[]>,
  ): Promise<ReadingThemeCatalog> {
    const catalogChanged = !readingThemeCatalogsEqual(stored, merged);
    const snapshotNeedsSync =
      ReadingThemeCatalogConfigService.snapshotNeedsManifestSync(snapshot, manifestIds);

    if (!catalogChanged && !snapshotNeedsSync) {
      return merged;
    }

    await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_READING_THEME_CATALOG_KEY },
      {
        $set: {
          readingThemeCatalog: merged,
          readingThemeManifestSnapshot: manifestIds,
        },
      },
    );

    return merged;
  }

  static async getSystemCatalog(): Promise<ReadingThemeCatalog> {
    const { catalog } = await ReadingThemeCatalogConfigService.getSystemCatalogWithSnapshot();
    return catalog;
  }

  static async getSystemCatalogWithSnapshot(): Promise<{
    catalog: ReadingThemeCatalog;
    snapshot: Record<string, readonly string[]> | null;
  }> {
    const doc = await ReadingThemeCatalogConfigService.loadConfigDoc();
    const stored = parseReadingThemeCatalogFromUser(doc?.readingThemeCatalog);
    const snapshot = ReadingThemeCatalogConfigService.parseManifestSnapshot(
      doc?.readingThemeManifestSnapshot,
    );
    const manifestIds = getManifestThemeIdsByStyle();
    const merged = mergeSystemCatalogWithManifest(stored, manifestIds, snapshot);
    const catalog = await ReadingThemeCatalogConfigService.persistSystemCatalogIfNeeded(
      stored,
      merged,
      snapshot,
      manifestIds,
    );

    return {
      catalog,
      snapshot,
    };
  }

  static async getManifestSnapshot(): Promise<Record<string, readonly string[]> | null> {
    const doc = await ReadingThemeCatalogConfigService.loadConfigDoc();
    return ReadingThemeCatalogConfigService.parseManifestSnapshot(
      doc?.readingThemeManifestSnapshot,
    );
  }

  static async migrateUserReadingThemeCatalog(
    userCatalogRaw: unknown,
    systemCatalog: ReadingThemeCatalog,
    manifestSnapshotByStyle?: Record<string, readonly string[]> | null,
  ): Promise<{ catalog: ReadingThemeCatalog | null; changed: boolean }> {
    const snapshot =
      manifestSnapshotByStyle !== undefined
        ? manifestSnapshotByStyle
        : await ReadingThemeCatalogConfigService.getManifestSnapshot();
    const userCatalog = parseReadingThemeCatalogFromUser(userCatalogRaw);
    const migrated = appendNewManifestStylesToUserCatalog(
      userCatalog,
      systemCatalog,
      snapshot,
    );

    if (!migrated) {
      return { catalog: null, changed: false };
    }

    return {
      catalog: migrated,
      changed: !readingThemeCatalogsEqual(userCatalog, migrated),
    };
  }

  static async getForAdmin(): Promise<AdminReadingThemeCatalogResponse> {
    const doc = await ReadingThemeCatalogConfigService.loadConfigDoc();
    const catalog = await ReadingThemeCatalogConfigService.getSystemCatalog();

    return {
      catalog,
      manifest: buildReadingThemeManifest(),
      updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
  }

  static async updateFromAdmin(
    payload: ReadingThemeCatalog,
  ): Promise<AdminReadingThemeCatalogResponse> {
    await ReadingThemeCatalogConfigService.ensureDocument();
    const catalog = validateReadingThemeCatalogInput(payload);
    const manifestSnapshot = getManifestThemeIdsByStyle();

    const doc = await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_READING_THEME_CATALOG_KEY },
      {
        $set: {
          readingThemeCatalog: catalog,
          readingThemeManifestSnapshot: manifestSnapshot,
        },
      },
      { new: true },
    ).lean();

    return {
      catalog: mergeSystemCatalogWithManifest(
        catalog,
        manifestSnapshot,
        manifestSnapshot,
      ),
      manifest: buildReadingThemeManifest(),
      updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
  }

  static async resetToDefault(): Promise<AdminReadingThemeCatalogResponse> {
    return ReadingThemeCatalogConfigService.updateFromAdmin(
      buildDefaultReadingThemeCatalog(),
    );
  }
}
