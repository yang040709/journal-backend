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

  static async getSystemCatalog(): Promise<ReadingThemeCatalog> {
    const doc = await ReadingThemeCatalogConfigService.loadConfigDoc();
    return ReadingThemeCatalogConfigService.buildMergedCatalog(
      doc?.readingThemeCatalog,
      doc?.readingThemeManifestSnapshot,
    );
  }

  static async getForAdmin(): Promise<AdminReadingThemeCatalogResponse> {
    const doc = await ReadingThemeCatalogConfigService.loadConfigDoc();

    return {
      catalog: ReadingThemeCatalogConfigService.buildMergedCatalog(
        doc?.readingThemeCatalog,
        doc?.readingThemeManifestSnapshot,
      ),
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
