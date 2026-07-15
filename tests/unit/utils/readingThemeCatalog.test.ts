import { describe, expect, it } from "vitest";
import {
  buildDefaultReadingThemeCatalog,
  mergeSystemCatalogWithManifest,
  appendNewManifestStylesToUserCatalog,
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

  it("mergeSystemCatalogWithManifest does not restore admin-hidden style keys", () => {
    const manifest = getManifestThemeIdsByStyle();
    const merged = mergeSystemCatalogWithManifest(
      {
        styleKeys: [null, "minimalNordic"],
        themeIdsByStyle: {
          minimalNordic: [...(manifest.minimalNordic || [])],
        },
      },
      manifest,
      manifest,
    );

    expect(merged.styleKeys).not.toContain("journal");
  });

  it("mergeSystemCatalogWithManifest appends new manifest style keys since snapshot", () => {
    const manifest = getManifestThemeIdsByStyle();
    const snapshotWithoutFilm: Record<string, readonly string[]> = {};
    for (const [styleKey, themeIds] of Object.entries(manifest)) {
      if (styleKey === "filmTravel") continue;
      snapshotWithoutFilm[styleKey] = themeIds;
    }

    const storedStyles = Object.keys(snapshotWithoutFilm);
    const merged = mergeSystemCatalogWithManifest(
      {
        styleKeys: [null, ...storedStyles],
        themeIdsByStyle: Object.fromEntries(
          storedStyles.map((styleKey) => [styleKey, [...(manifest[styleKey] || [])]]),
        ),
      },
      manifest,
      snapshotWithoutFilm,
    );

    expect(merged.styleKeys).toContain("filmTravel");
    expect(merged.themeIdsByStyle.filmTravel).toEqual([...(manifest.filmTravel || [])]);
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

  it("appendNewManifestStylesToUserCatalog enables new styles for saved user catalogs", () => {
    const manifest = getManifestThemeIdsByStyle();
    const system = mergeSystemCatalogWithManifest(
      {
        styleKeys: [null, "journal", "minimalNordic", "vintageJournal", "watercolorSketch", "dreamyCinematic", "productMemo"],
        themeIdsByStyle: Object.fromEntries(
          ["journal", "minimalNordic", "vintageJournal", "watercolorSketch", "dreamyCinematic", "productMemo"].map(
            (styleKey) => [styleKey, [...(manifest[styleKey] || [])]],
          ),
        ),
      },
      manifest,
      Object.fromEntries(
        Object.entries(manifest).filter(([styleKey]) => styleKey !== "filmTravel"),
      ),
    );

    const user = {
      styleKeys: [null, "journal", "minimalNordic", "vintageJournal", "watercolorSketch", "dreamyCinematic", "productMemo"],
      themeIdsByStyle: Object.fromEntries(
        ["journal", "minimalNordic", "vintageJournal", "watercolorSketch", "dreamyCinematic", "productMemo"].map(
          (styleKey) => [styleKey, [...(manifest[styleKey] || [])]],
        ),
      ),
    };

    const migrated = appendNewManifestStylesToUserCatalog(
      user,
      system,
      Object.fromEntries(
        Object.entries(manifest).filter(([styleKey]) => styleKey !== "filmTravel"),
      ),
    );

    expect(migrated?.styleKeys).toContain("filmTravel");
    expect(migrated?.themeIdsByStyle.filmTravel).toEqual([...(manifest.filmTravel || [])]);
  });

  it("appendNewManifestStylesToUserCatalog appends new theme ids within existing styles since snapshot", () => {
    const migrated = appendNewManifestStylesToUserCatalog(
      {
        styleKeys: [null, "filmTravel"],
        themeIdsByStyle: {
          filmTravel: ["film-default", "film-golden"],
        },
      },
      {
        styleKeys: [null, "filmTravel"],
        themeIdsByStyle: {
          filmTravel: [
            "film-default",
            "film-golden",
            "film-mintTrail",
            "film-sakuraPass",
          ],
        },
      },
      {
        filmTravel: ["film-default", "film-golden"],
      },
    );

    expect(migrated?.themeIdsByStyle.filmTravel).toEqual([
      "film-default",
      "film-golden",
      "film-mintTrail",
      "film-sakuraPass",
    ]);
  });

  it("appendNewManifestStylesToUserCatalog does not restore user-hidden theme ids", () => {
    const migrated = appendNewManifestStylesToUserCatalog(
      {
        styleKeys: [null, "filmTravel"],
        themeIdsByStyle: {
          filmTravel: ["film-default"],
        },
      },
      {
        styleKeys: [null, "filmTravel"],
        themeIdsByStyle: {
          filmTravel: [
            "film-default",
            "film-golden",
            "film-mintTrail",
            "film-sakuraPass",
          ],
        },
      },
      {
        filmTravel: ["film-default", "film-golden"],
      },
    );

    expect(migrated?.themeIdsByStyle.filmTravel).toEqual([
      "film-default",
      "film-mintTrail",
      "film-sakuraPass",
    ]);
    expect(migrated?.themeIdsByStyle.filmTravel).not.toContain("film-golden");
  });

  it("appendNewManifestStylesToUserCatalog respects user hide after snapshot includes style", () => {
    const manifest = getManifestThemeIdsByStyle();
    const snapshotWithFilm = { ...manifest };
    const system = mergeSystemCatalogWithManifest(
      {
        styleKeys: [null, ...Object.keys(manifest)],
        themeIdsByStyle: Object.fromEntries(
          Object.entries(manifest).map(([styleKey, themeIds]) => [styleKey, [...themeIds]]),
        ),
      },
      manifest,
      snapshotWithFilm,
    );

    const user = {
      styleKeys: [null, "journal", "minimalNordic"],
      themeIdsByStyle: {
        journal: [...(manifest.journal || [])],
        minimalNordic: [...(manifest.minimalNordic || [])],
      },
    };

    const migrated = appendNewManifestStylesToUserCatalog(user, system, snapshotWithFilm);

    expect(migrated?.styleKeys).not.toContain("filmTravel");
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
