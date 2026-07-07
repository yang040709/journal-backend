import Router from "@koa/router";
import { success, error, ErrorCodes } from "../utils/response";
import { ExportService } from "../service/export.service";
import { ImportService, ImportOptions } from "../service/import.service";
import { z } from "zod";
import { authMiddleware } from "../middlewares/auth.middleware";
import logger from "../utils/logger";

function envInt(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

// Defaults aim to be backward-compatible; tighten via env if needed.
const IMPORT_MAX_NOTEBOOKS = envInt("IMPORT_MAX_NOTEBOOKS", 500);
const IMPORT_MAX_NOTES = envInt("IMPORT_MAX_NOTES", 20_000);
const IMPORT_MAX_TEXT_LENGTH = envInt("IMPORT_MAX_TEXT_LENGTH", 50_000);

const importNotebookSchema = z
  .object({
    id: z.string().trim().max(128).optional(),
    title: z.string().trim().min(1).max(120),
    coverImg: z.string().max(2048).optional().default(""),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

const importNoteSchema = z
  .object({
    id: z.string().trim().max(128).optional(),
    noteBookId: z.string().trim().min(1).max(128),
    title: z.string().trim().min(1).max(120),
    content: z.string().max(IMPORT_MAX_TEXT_LENGTH),
    tags: z.array(z.string().trim().max(30)).max(100).optional().default([]),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

const router = new Router({
  prefix: "/export",
});

// 导入请求验证
const importSchema = z.object({
  data: z.object({
    noteBooks: z.array(importNotebookSchema).max(IMPORT_MAX_NOTEBOOKS),
    notes: z.array(importNoteSchema).max(IMPORT_MAX_NOTES),
  }),
  version: z.string().optional(),
  exportTime: z.string().optional(),
  appName: z.string().optional(),
  statistics: z
    .object({
      noteBookCount: z.number().optional(),
      noteCount: z.number().optional(),
    })
    .optional(),
});

const importOptionsSchema = z.object({
  mode: z.enum(["replace", "merge"]).default("replace"),
  conflictStrategy: z.enum(["skip", "overwrite"]).default("overwrite"),
});

router.use(authMiddleware);

/**
 * @openapi
 * /export/data:
 *   get:
 *     tags:
 *       - export
 *     summary: 导出用户数据
 *     description: 导出当前用户的全部手帐本与手帐数据，响应为 JSON 附件
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 导出成功
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *             description: 附件文件名（UTF-8 编码）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/data", async (ctx) => {
  try {
    const userId = ctx.user!.userId;

    if (!userId) {
      error(ctx, "用户未认证", ErrorCodes.UNAUTHORIZED, 401);
      return;
    }

    const exportData = await ExportService.exportUserData(userId);

    // 设置响应头，触发文件下载
    const fileName = ExportService.getExportFileName();
    // 对文件名进行编码，避免 HTTP 头中的无效字符错误
    // 使用 RFC 5987 编码格式，支持中文文件名
    const encodedFileName = encodeURIComponent(fileName).replace(/'/g, "%27");
    ctx.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodedFileName}`
    );
    ctx.set("Content-Type", "application/json");

    success(ctx, exportData, "导出成功");
  } catch (err) {
    logger.error("导出数据失败", {
      requestId: ctx.state.requestId,
      userId: ctx.user?.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    error(ctx, err.message || "导出失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /export/import:
 *   post:
 *     tags:
 *       - export
 *     summary: 导入用户数据
 *     description: 从备份 JSON 导入手帐本与手帐数据，支持 replace/merge 模式
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [replace, merge]
 *           default: replace
 *         description: 导入模式
 *       - in: query
 *         name: conflictStrategy
 *         schema:
 *           type: string
 *           enum: [skip, overwrite]
 *           default: overwrite
 *         description: 冲突处理策略
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               data:
 *                 type: object
 *                 required:
 *                   - noteBooks
 *                   - notes
 *                 properties:
 *                   noteBooks:
 *                     type: array
 *                     items:
 *                       type: object
 *                   notes:
 *                     type: array
 *                     items:
 *                       type: object
 *               version:
 *                 type: string
 *               exportTime:
 *                 type: string
 *               appName:
 *                 type: string
 *               statistics:
 *                 type: object
 *                 properties:
 *                   noteBookCount:
 *                     type: integer
 *                   noteCount:
 *                     type: integer
 *     responses:
 *       200:
 *         description: 导入成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       400:
 *         description: 参数验证失败或导入业务错误
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post("/import", async (ctx) => {
  try {
    const userId = ctx.user!.userId;

    if (!userId) {
      error(ctx, "用户未认证", ErrorCodes.UNAUTHORIZED, 401);
      return;
    }

    // 验证请求体
    const body = importSchema.parse(ctx.request.body);
    const options = importOptionsSchema.parse(ctx.query);

    // 执行导入
    const result = await ImportService.importUserData(
      userId,
      body as any,
      options
    );

    if (result.success) {
      success(ctx, result, result.message);
    } else {
      // 创建一个包含额外信息的错误响应
      ctx.status = 400;
      ctx.body = {
        code: ErrorCodes.IMPORT_ERROR,
        message: result.message,
        data: {
          errors: result.errors,
          statistics: result.statistics,
        },
        timestamp: Date.now(),
      };
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      ctx.status = 400;
      ctx.body = {
        code: ErrorCodes.PARAM_ERROR,
        message: "参数验证失败",
        data: {
          errors:
            (err as any).errors?.map((e: any) => ({
              path: e.path?.join(".") || "",
              message: e.message || "未知错误",
            })) || [],
        },
        timestamp: Date.now(),
      };
    } else {
      logger.error("导入数据失败", {
        requestId: ctx.state.requestId,
        userId: ctx.user?.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      error(ctx, err.message || "导入失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

export default router;
