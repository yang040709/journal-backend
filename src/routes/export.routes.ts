import Router from "@koa/router";
import { success, error, ErrorCodes } from "../utils/response";
import { ExportService } from "../service/export.service";
import { ImportService, ImportOptions } from "../service/import.service";
import { z } from "zod";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = new Router({
  prefix: "/export",
});

// 导入请求验证
const importSchema = z.object({
  data: z.object({
    noteBooks: z.array(z.any()),
    notes: z.array(z.any()),
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
 * @route GET /export/data
 * @desc 导出用户数据
 */
router.get("/data", async (ctx) => {
  try {
    const userId = ctx.user!.userId;
    console.log(ctx.user, "<==ctx.user");

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
    console.error("导出数据失败:", err);
    error(ctx, err.message || "导出失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @route POST /export/import
 * @desc 导入用户数据
 */
router.post("/import", async (ctx) => {
  try {
    const userId = ctx.user!.userId;
    console.log(ctx.user, "<==ctx.user");

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
      console.error("导入数据失败:", err);
      error(ctx, err.message || "导入失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

export default router;
