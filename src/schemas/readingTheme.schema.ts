import { z } from "zod";
import { READING_STYLE_KEYS } from "../constant/noteReadingTheme";

export const updateDefaultReadingThemeSchema = z.object({
  defaultReadingStyleKey: z.enum(READING_STYLE_KEYS).nullable().optional(),
  defaultReadingThemeId: z.string().trim().max(64).nullable().optional(),
  readingThemeApplyScope: z.enum(["global", "note"]).optional(),
});

export const readingThemeCatalogPutSchema = z.object({
  styleKeys: z.array(z.union([z.enum(READING_STYLE_KEYS), z.null()])),
  themeIdsByStyle: z.record(z.string(), z.array(z.string().trim().max(64))),
});
