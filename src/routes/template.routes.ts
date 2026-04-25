import Router from "@koa/router";
import { authMiddleware, AuthContext } from "../middlewares/auth.middleware";
import {
  success,
  error,
  paginatedSuccess,
  ErrorCodes,
} from "../utils/response";
import { TemplateService } from "../service/template.service";
import { AiTemplateService } from "../service/aiTemplate.service";
import { z } from "zod";
import logger from "../utils/logger";

const MAX_PAGE_DEPTH = 10_000;
const MIN_SEARCH_LENGTH = 1;

const router = new Router({
  prefix: "/templates",
});

// 所有路由都需要认证
router.use(authMiddleware);

// 创建模板请求验证
const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "模板名称不能为空")
    .max(100, "模板名称不能超过100个字符"),
  description: z
    .string()
    .max(500, "模板描述不能超过500个字符")
    .optional()
    .default(""),
  fields: z.object({
    title: z
      .string()
      .min(1, "标题模板不能为空")
      .max(200, "标题模板不能超过200个字符"),
    content: z.string().min(1, "内容模板不能为空"),
    tags: z.array(z.string()).optional().default([]),
  }),
});

// 更新模板请求验证
const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  fields: z
    .object({
      title: z.string().min(1).max(200).optional(),
      content: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

// 分页参数验证
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z
    .enum(["createdAt", "updatedAt", "name"])
    .optional()
    .default("updatedAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  search: z.preprocess((v) => {
    if (v == null) return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
  }, z.string().min(MIN_SEARCH_LENGTH, `搜索关键词至少 ${MIN_SEARCH_LENGTH} 个字符`).optional()),
}).refine((val) => val.page * val.limit <= MAX_PAGE_DEPTH, {
  message: `分页深度超过限制（page*limit <= ${MAX_PAGE_DEPTH}）`,
  path: ["page"],
});

// 批量删除请求验证
const batchDeleteSchema = z.object({
  templateIds: z.array(z.string()).min(1, "至少需要提供一个模板ID"),
});

const aiTemplateGenerateSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("template_generate"),
    name: z.string().min(1, "模板名称不能为空").max(100),
    description: z.string().max(500).optional().default(""),
    supplementRequirement: z.string().max(500).optional(),
    hint: z.string().max(500).optional(),
  }),
  z.object({
    mode: z.literal("template_rewrite"),
    supplementRequirement: z.string().max(500).optional(),
    hint: z.string().max(500).optional(),
    template: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional().default(""),
      fields: z.object({
        title: z.string().min(1),
        content: z.string().min(1),
        tags: z.array(z.string()).optional().default([]),
      }),
    }),
  }),
]);

/**
 * @route GET /templates
 * @desc 获取用户模板列表
 */
router.get("/", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const params = paginationSchema.parse(ctx.query);
    const result = await TemplateService.getUserTemplates(userId, params);
    paginatedSuccess(
      ctx,
      result.items,
      result.total,
      params.page,
      params.limit,
      "获取模板列表成功",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else if (
      err instanceof Error &&
      (err.message.includes("分页深度超过限制") || err.message.includes("搜索关键词至少"))
    ) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
    } else {
      logger.error("获取模板列表失败:", err);
      error(ctx, "获取模板列表失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @route GET /templates/all
 * @desc 获取所有模板（系统模板 + 用户自定义模板）
 */
router.get("/all", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const templates = await TemplateService.getAllTemplates(userId);
    success(ctx, templates, "获取所有模板成功");
  } catch (err) {
    logger.error("获取所有模板失败:", err);
    error(ctx, "获取所有模板失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route POST /templates/ai/generate
 * @desc AI 生成或润色模板（与手帐 AI 共用日额度）
 */
router.post("/ai/generate", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = aiTemplateGenerateSchema.parse(ctx.request.body);
    const supplementRequirement = body.supplementRequirement ?? body.hint;
    const result = await AiTemplateService.generate({
      userId,
      mode: body.mode,
      ...(body.mode === "template_generate"
        ? {
            name: body.name,
            description: body.description,
            supplementRequirement,
            hint: body.hint,
          }
        : {
            supplementRequirement,
            hint: body.hint,
            template: {
              name: body.template.name,
              description: body.template.description,
              fields: {
                title: body.template.fields.title,
                content: body.template.fields.content,
                tags: body.template.fields.tags,
              },
            },
          }),
    });
    success(ctx, result, "ok");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    const message = err instanceof Error ? err.message : "AI 生成模板失败";
    const code =
      err instanceof Error && (err as Error & { code?: string }).code === "AI_DAILY_LIMIT_EXCEEDED"
        ? ErrorCodes.AI_DAILY_LIMIT_EXCEEDED
        : undefined;
    if (code === ErrorCodes.AI_DAILY_LIMIT_EXCEEDED) {
      error(ctx, message, ErrorCodes.AI_DAILY_LIMIT_EXCEEDED, 429);
      return;
    }
    if (message === "AI service not configured") {
      error(ctx, "AI 服务未配置", ErrorCodes.INTERNAL_ERROR, 500);
      return;
    }
    if (message === "请先填写模板名称" || message === "请先填写标题模板与内容模板后再改写") {
      error(ctx, message, ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    logger.error("AI 模板生成失败:", err);
    error(ctx, message, ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route GET /templates/:id
 * @desc 获取单个模板
 */
router.get("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const template = await TemplateService.getTemplateById(id, userId);
    if (!template) {
      error(ctx, "模板不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }

    success(ctx, template, "获取模板成功");
  } catch (err) {
    logger.error("获取模板失败:", err);
    error(ctx, "获取模板失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route POST /templates
 * @desc 创建模板
 */
router.post("/", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = createTemplateSchema.parse(ctx.request.body);

    const template = await TemplateService.createTemplate(userId, body);
    success(ctx, template, "创建模板成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      logger.error("参数验证失败详情:", err.issues);
      error(
        ctx,
        `参数验证失败: ${err.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
        ErrorCodes.PARAM_ERROR,
        400,
      );
    } else {
      logger.error("创建模板失败:", err);
      error(ctx, "创建模板失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @route PUT /templates/:id
 * @desc 更新模板
 */
router.put("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;
    const body = updateTemplateSchema.parse(ctx.request.body);

    const template = await TemplateService.updateTemplate(id, userId, body);
    if (!template) {
      error(ctx, "模板不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }

    success(ctx, template, "更新模板成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      logger.error("更新模板失败:", err);
      error(ctx, "更新模板失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

/**
 * @route DELETE /templates/:id
 * @desc 删除模板
 */
router.delete("/:id", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const deleted = await TemplateService.deleteTemplate(id, userId);
    if (!deleted) {
      error(ctx, "模板不存在", ErrorCodes.NOT_FOUND, 404);
      return;
    }

    success(ctx, { deleted: true }, "删除模板成功");
  } catch (err) {
    logger.error("删除模板失败:", err);
    error(ctx, "删除模板失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route POST /templates/batch-delete
 * @desc 批量删除模板
 */
router.post("/batch-delete", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const body = batchDeleteSchema.parse(ctx.request.body);

    const deletedCount = await TemplateService.batchDeleteTemplates(
      body.templateIds,
      userId,
    );

    success(ctx, { deletedCount }, `成功删除 ${deletedCount} 个模板`);
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      logger.error("批量删除模板失败:", err);
      error(ctx, "批量删除模板失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

export default router;
