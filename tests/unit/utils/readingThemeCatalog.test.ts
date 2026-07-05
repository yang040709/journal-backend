import { describe, expect, it } from "vitest";
import {
  buildDefaultReadingThemeCatalog,
  mergeSystemCatalogWithManifest,
  validateUserReadingThemeCatalogAgainstSystem,
} from "../../../src/utils/readingThemeCatalog";
import { getManifestThemeIdsByStyle } from "../../../src/constant/readingThemeManifest";

describe("readingThemeCatalog utils (system)", () => {
  it("mergeSystemCatalogWithManifest does not restore admin-hidden themes", () => {
    const manifest = getManifestThemeIdsByStyle();
    const journalIds = manifest.journal || [];
    const firstId = journalIds[0];
    const merged = mergeSystemCatalogWithManifest(
      {
        styleKeys: [null, "journal"],
        themeIdsByStyle: { journal: [firstId] },
      },
      manifest,
      manifest,
    );

    expect(merged.themeIdsByStyle.journal).toEqual([firstId]);
  });

  it("mergeSystemCatalogWithManifest appends only manifest ids new since snapshot", () => {
    const merged = mergeSystemCatalogWithManifest(
      {
        styleKeys: [null, "journal"],
        themeIdsByStyle: { journal: ["theme-a"] },
      },
      { journal: ["theme-a", "theme-b", "theme-c"] },
      { journal: ["theme-a", "theme-b"] },
    );

    expect(merged.themeIdsByStyle.journal).toEqual(["theme-a", "theme-c"]);
  });

  it("validateUserReadingThemeCatalogAgainstSystem rejects hidden system theme", () => {
    const system = {
      styleKeys: [null, "journal"],
      themeIdsByStyle: {
        journal: buildDefaultReadingThemeCatalog().themeIdsByStyle.journal.slice(0, 1),
      },
    };
    const user = buildDefaultReadingThemeCatalog();

    expect(() => validateUserReadingThemeCatalogAgainstSystem(user, system)).toThrow(
      /已被系统隐藏/,
    );
  });
});
