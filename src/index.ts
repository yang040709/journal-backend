import "dotenv/config";
import app, { startSchedulersAfterDBConnection } from "./app";

import { connectDB } from "./config/db";
import { runMigrations, migrateSoftDeleteBackfill } from "./utils/migration";
import { initSensitiveFilter } from "./utils/sensitive-encrypted";
import { ensureAdminBootstrap } from "./service/adminBootstrap.service";
import { ensureSystemTemplates } from "./service/systemTemplateSeed.service";
import { AiStyleService } from "./service/aiStyle.service";
import { ShareSecurityTaskService } from "./service/shareSecurityTask.service";
import { AlertRuleService } from "./service/alertRule.service";
import logger from "./utils/logger";

const PORT = process.env.PORT || 3000;

// 进程级错误处理 - 防止未捕获的错误导致程序崩溃
process.on("uncaughtException", (error) => {
  logger.error("未捕获的异常", {
    name: error.name,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });

  // 在实际生产环境中，这里可以添加日志上报
  // 注意：不要立即退出进程，让错误处理中间件处理请求错误
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("未处理的 Promise 拒绝", {
    reason,
    promise,
    timestamp: new Date().toISOString(),
  });

  // 在实际生产环境中，这里可以添加日志上报
});

const init = async () => {
  try {
    if (!process.env.JWT_SECRET) {
      logger.warn("JWT_SECRET environment variable is not set; auth-related APIs may fail");
    }
    await connectDB();

    // 执行数据库迁移
    await runMigrations();
    // 兼容旧版本数据：自动补齐软删除字段（幂等，部署后会自动执行）
    await migrateSoftDeleteBackfill();

    await ensureAdminBootstrap();
    await ensureSystemTemplates();
    await AiStyleService.ensureSeed();
    await AlertRuleService.ensureDefaultRules();

    // 初始化敏感词过滤器
    logger.info("正在初始化敏感词过滤器");
    await initSensitiveFilter();
    logger.info("敏感词过滤器初始化完成");

    // 数据库连接成功后启动调度器
    startSchedulersAfterDBConnection();
    ShareSecurityTaskService.startWorker();

    const server = app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });

    // 优雅关闭处理
    const gracefulShutdown = () => {
      logger.warn("收到关闭信号，正在优雅关闭服务器");

      server.close(() => {
        logger.info("服务器已关闭");
        process.exit(0);
      });

      // 如果10秒后仍未关闭，强制退出
      setTimeout(() => {
        logger.error("强制关闭服务器");
        process.exit(1);
      }, 10000);
    };

    // 监听关闭信号
    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);
  } catch (error) {
    logger.error("服务器启动失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

init();
