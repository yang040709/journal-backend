import Koa from "koa";
import bodyParser from "koa-bodyparser";
import logger from "koa-logger";
import UserRouter from "./routes/user.routes";
import NoteBookRouter from "./routes/noteBook.routes";
import NoteRouter from "./routes/note.routes";
import StatsRouter from "./routes/stats.routes";
import ExportRouter from "./routes/export.routes";

const app = new Koa();

// 中间件
app.use(bodyParser());
app.use(logger());

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

// 404处理
app.use(async (ctx) => {
  ctx.status = 404;
  ctx.body = {
    code: 1004,
    message: "资源不存在",
    data: null,
    timestamp: Date.now(),
  };
});

export default app;
