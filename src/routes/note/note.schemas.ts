import { z } from "zod";
import { READING_STYLE_KEYS } from "../../constant/noteReadingTheme";
import { optionalNoteImagesSchema } from "../../schemas/noteImage.schema";
import {
  hasAllowedPageDepth,
  MAX_PAGE_DEPTH,
  MIN_SEARCH_KEYWORD_LENGTH,
  parseFavoriteOnlyQuery,
} from "./note.shared";

export const presetTagsQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((val) => (typeof val === "string" ? val.trim() : "")),
});

export const noteExportPreviewQuerySchema = z.object({
  noteBookId: z.string().min(1, "手帐本ID不能为空"),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
  sort: z.enum(["updatedAt", "createdAt"]).optional().default("updatedAt"),
});

export const noteExportRunBodySchema = z.object({
  noteBookId: z.string().min(1, "手帐本ID不能为空"),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  sort: z.enum(["updatedAt", "createdAt"]).optional().default("updatedAt"),
  clientPlatform: z.string().trim().max(32).optional(),
});

export const addCustomTagSchema = z.object({
  name: z.string().min(1, "标签名称不能为空"),
});

export const deleteCustomTagQuerySchema = z.object({
  name: z.string().min(1, "标签名称不能为空"),
});

export const createNoteSchema = z.object({
  noteBookId: z.string().min(1, "手帐本ID不能为空"),
  title: z.string().min(1).max(200),
  content: z.string(),
  tags: z.array(z.string()).optional().default([]),
  images: optionalNoteImagesSchema,
  appliedSystemTemplateKey: z.string().trim().max(120).optional(),
});

export const updateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  noteBookId: z.string().optional(),
  images: optionalNoteImagesSchema,
  isFavorite: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  readingStyleKey: z
    .enum(READING_STYLE_KEYS)
    .nullable()
    .optional(),
  readingThemeId: z.string().trim().max(64).nullable().optional(),
});

export const paginationSchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: z
      .enum(["createdAt", "updatedAt", "title", "favoritedAt"])
      .optional(),
    order: z.enum(["asc", "desc"]).optional().default("desc"),
    noteBookId: z.string().optional(),
    favoriteOnly: z
      .union([z.string(), z.boolean()])
      .optional()
      .transform(parseFavoriteOnlyQuery),
    tags: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        if (Array.isArray(val)) return val;
        return [val];
      }),
    startTime: z.coerce.number().optional(),
    endTime: z.coerce.number().optional(),
  })
  .refine((val) => hasAllowedPageDepth(val.page, val.limit), {
    message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
    path: ["page"],
  })
  .refine(
    (val) => !(val.sortBy === "favoritedAt" && !val.favoriteOnly),
    {
      message: "仅当 favoriteOnly 为 true 时可使用 favoritedAt 排序",
      path: ["sortBy"],
    },
  );

export const searchSchema = z
  .object({
    q: z.string().trim().min(MIN_SEARCH_KEYWORD_LENGTH, `搜索关键词至少 ${MIN_SEARCH_KEYWORD_LENGTH} 个字符`),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    noteBookId: z.string().optional(),
    favoriteOnly: z
      .union([z.string(), z.boolean()])
      .optional()
      .transform(parseFavoriteOnlyQuery),
    sortBy: z
      .enum(["createdAt", "updatedAt", "title", "favoritedAt"])
      .optional(),
    order: z.enum(["asc", "desc"]).optional().default("desc"),
    tags: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        if (Array.isArray(val)) return val;
        return [val];
      }),
    startTime: z.coerce.number().optional(),
    endTime: z.coerce.number().optional(),
  })
  .refine((val) => hasAllowedPageDepth(val.page, val.limit), {
    message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
    path: ["page"],
  })
  .refine(
    (val) => !(val.sortBy === "favoritedAt" && !val.favoriteOnly),
    {
      message: "仅当 favoriteOnly 为 true 时可使用 favoritedAt 排序",
      path: ["sortBy"],
    },
  );

/** 旧版客户端：GET /notes/search，data 为数组；单次最多 100 条，无分页元数据 */
export const searchLegacySchema = z.object({
  q: z.string().trim().min(MIN_SEARCH_KEYWORD_LENGTH, `搜索关键词至少 ${MIN_SEARCH_KEYWORD_LENGTH} 个字符`),
  limit: z.coerce.number().int().min(1).max(100).optional().default(100),
  noteBookId: z.string().optional(),
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val;
      return [val];
    }),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
});

export const batchDeleteSchema = z.object({
  noteIds: z.array(z.string()).min(1, "至少需要提供一个手帐ID"),
});

export const restoreNoteSchema = z.object({
  targetNoteBookId: z.string().optional(),
});

export const aiGenerateSchema = z.object({
  mode: z.enum(["generate", "rewrite", "continue"]),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  hint: z.string().optional(),
  styleKey: z.string().trim().max(64).optional(),
});

export const calendarDailyCountsSchema = z
  .object({
    startTime: z.coerce.number().int(),
    endTime: z.coerce.number().int(),
    tz: z.string().trim().max(64).optional().default("Asia/Shanghai"),
  })
  .refine((v) => v.endTime >= v.startTime, {
    message: "endTime 不能早于 startTime",
    path: ["endTime"],
  })
  .refine((v) => v.endTime - v.startTime <= 45 * 24 * 60 * 60 * 1000, {
    message: "时间跨度不能超过 45 天",
    path: ["endTime"],
  });

export const onThisDaySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  day: z.coerce.number().int().min(1).max(31).optional(),
  tz: z.string().trim().max(64).optional().default("Asia/Shanghai"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const recentLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .default(10);
