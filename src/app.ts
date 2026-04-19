import Koa from "koa";
import bodyParser from "koa-bodyparser";
import { errorMiddleware } from "./middlewares/error.middleware";
import {
  requestIdMiddleware,
  createRequestContext,
} from "./middlewares/requestId.middleware";
import { logger, logHttpRequest } from "./utils/logger";
import UserRouter from "./routes/user.routes";
import NoteBookRouter from "./routes/noteBook.routes";
import NoteRouter from "./routes/note.routes";
import StatsRouter from "./routes/stats.routes";
import ExportRouter from "./routes/export.routes";
import ReminderRouter from "./routes/reminder.routes";
import TemplateRouter from "./routes/template.routes";
import ShareRouter from "./routes/share.routes";
import CoverRouter from "./routes/cover.routes";
import UploadRouter from "./routes/upload.routes";
import PointsRouter from "./routes/points.routes";
import NoteExportUserRouter from "./routes/noteExportUser.routes";
import AssetRouter from "./routes/asset.routes";
import FeedbackRouter from "./routes/feedback.routes";
import AdminRouter from "./routes/admin.routes";
import { adminCorsMiddleware } from "./middlewares/adminCors.middleware";
import { staticFilesMiddleware } from "./middlewares/staticFiles.middleware";
import { startAllSchedulers } from "./scheduler";
import SwaggerJSdoc from "swagger-jsdoc";
import swaggerOptions from "./config/swaggerOptions";
// import swaggerUi from "swagger-ui-koa";
import { koaSwagger } from "koa2-swagger-ui";

const specs = SwaggerJSdoc(swaggerOptions);

const app = new Koa();

app.use(
  koaSwagger({
    routePrefix: "/docs", // 访问路径
    swaggerOptions: {
      spec: specs, // 直接传入你的 swaggerOptions 生成的 specs
    },
  }),
);
// 中间件
app.use(adminCorsMiddleware);
app.use(staticFilesMiddleware);
app.use(bodyParser());

// 请求ID中间件（放在最前面）
app.use(requestIdMiddleware);

// 全局错误处理中间件（放在其他中间件之前）
app.use(errorMiddleware);

// 请求日志中间件（替换原来的koa-logger和自定义日志）
app.use(async (ctx, next) => {
  const start = Date.now();

  try {
    await next();
  } finally {
    const ms = Date.now() - start;
    const requestContext = createRequestContext(ctx);

    // 记录HTTP请求
    logHttpRequest(
      requestContext.requestId,
      requestContext.userId,
      ctx.method,
      ctx.url,
      ctx.status,
      ms,
      {
        ip: requestContext.ip,
        userAgent: requestContext.userAgent,
      },
    );
  }
});

// 路由
app.use(AdminRouter.routes()).use(AdminRouter.allowedMethods());
app.use(UserRouter.routes()).use(UserRouter.allowedMethods());
app.use(NoteBookRouter.routes()).use(NoteBookRouter.allowedMethods());
app.use(NoteRouter.routes()).use(NoteRouter.allowedMethods());
app.use(NoteExportUserRouter.routes()).use(NoteExportUserRouter.allowedMethods());
app.use(StatsRouter.routes()).use(StatsRouter.allowedMethods());
app.use(ExportRouter.routes()).use(ExportRouter.allowedMethods());
app.use(ReminderRouter.routes()).use(ReminderRouter.allowedMethods());
app.use(TemplateRouter.routes()).use(TemplateRouter.allowedMethods());
app.use(ShareRouter.routes()).use(ShareRouter.allowedMethods());
app.use(CoverRouter.routes()).use(CoverRouter.allowedMethods());
app.use(AssetRouter.routes()).use(AssetRouter.allowedMethods());
app.use(FeedbackRouter.routes()).use(FeedbackRouter.allowedMethods());
app.use(UploadRouter.routes()).use(UploadRouter.allowedMethods());
app.use(PointsRouter.routes()).use(PointsRouter.allowedMethods());

// 注意：404处理现在由 errorMiddleware 自动处理
// 当没有匹配的路由时，errorMiddleware 会捕获并返回 404 响应

export default app;

// 调度器启动函数（由 index.ts 调用）
export function startSchedulersAfterDBConnection(): void {
  logger.info("数据库连接成功，准备启动调度器...");

  // 延迟启动调度器，确保数据库完全就绪
  setTimeout(() => {
    try {
      startAllSchedulers();
    } catch (error) {
      logger.error("调度器启动失败，但不会影响服务器运行", {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }, 2000); // 延迟2秒启动
}
