import Koa from "koa";
import bodyParser from "koa-bodyparser";
import logger from "koa-logger";
import { errorMiddleware } from "./middlewares/error.middleware";
import UserRouter from "./routes/user.routes";
import NoteBookRouter from "./routes/noteBook.routes";
import NoteRouter from "./routes/note.routes";
import StatsRouter from "./routes/stats.routes";
import ExportRouter from "./routes/export.routes";
import ReminderRouter from "./routes/reminder.routes";
import { startAllSchedulers } from "./scheduler";

const app = new Koa();

// 中间件
app.use(bodyParser());
app.use(logger());

// 全局错误处理中间件（放在其他中间件之前）
app.use(errorMiddleware);

// 请求日志
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
});

// 路由
app.use(UserRouter.routes()).use(UserRouter.allowedMethods());
app.use(NoteBookRouter.routes()).use(NoteBookRouter.allowedMethods());
app.use(NoteRouter.routes()).use(NoteRouter.allowedMethods());
app.use(StatsRouter.routes()).use(StatsRouter.allowedMethods());
app.use(ExportRouter.routes()).use(ExportRouter.allowedMethods());
app.use(ReminderRouter.routes()).use(ReminderRouter.allowedMethods());

// 注意：404处理现在由 errorMiddleware 自动处理
// 当没有匹配的路由时，errorMiddleware 会捕获并返回 404 响应

export default app;

// 调度器启动函数（由 index.ts 调用）
export function startSchedulersAfterDBConnection(): void {
  console.log("数据库连接成功，准备启动调度器...");

  // 延迟启动调度器，确保数据库完全就绪
  setTimeout(() => {
    try {
      startAllSchedulers();
    } catch (error) {
      console.error("调度器启动失败，但不会影响服务器运行:", error);
    }
  }, 2000); // 延迟2秒启动
}
