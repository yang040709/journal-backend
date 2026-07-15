import { z } from "zod";

export const ALBUM_COVER_NO_IMAGE_STYLE_VALUES = [
  "dateTeaser",
  "watermark",
  "excerpt",
] as const;

export const updateDisplayPreferenceSchema = z
  .object({
    showNoteWordCount: z.boolean().optional(),
    showReadingThemeClockTime: z.boolean().optional(),
    useLegacyNoteItem: z.boolean().optional(),
    albumCoverHighSaturation: z.boolean().optional(),
    albumCoverNoImageStyle: z.enum(ALBUM_COVER_NO_IMAGE_STYLE_VALUES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "至少更新一个字段",
  });

export type UpdateDisplayPreferenceInput = z.infer<
  typeof updateDisplayPreferenceSchema
>;
