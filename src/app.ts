import Koa from "koa";
import bodyParser from "koa-bodyparser";
import logger from "koa-logger";
import { errorMiddleware } from "./middlewares/error.middleware";
import UserRouter from "./routes/user.routes";
import NoteBookRouter from "./routes/noteBook.routes";
import NoteRouter from "./routes/note.routes";
import StatsRouter from "./routes/stats.routes";
import ExportRouter from "./routes/export.routes";

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

// 注意：404处理现在由 errorMiddleware 自动处理
// 当没有匹配的路由时，errorMiddleware 会捕获并返回 404 响应

export default app;
