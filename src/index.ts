import dotenv from "dotenv";
import app from "./app";

import { connectDB } from "./config/db";

dotenv.config();

const PORT = process.env.PORT || 3000;

// 进程级错误处理 - 防止未捕获的错误导致程序崩溃
process.on("uncaughtException", (error) => {
  console.error("⚠️ 未捕获的异常:", {
    name: error.name,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });

  // 在实际生产环境中，这里可以添加日志上报
  // 注意：不要立即退出进程，让错误处理中间件处理请求错误
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ 未处理的 Promise 拒绝:", {
    reason,
    promise,
    timestamp: new Date().toISOString(),
  });

  // 在实际生产环境中，这里可以添加日志上报
});

const init = async () => {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });

    // 优雅关闭处理
    const gracefulShutdown = () => {
      console.log("🛑 收到关闭信号，正在优雅关闭服务器...");

      server.close(() => {
        console.log("✅ 服务器已关闭");
        process.exit(0);
      });

      // 如果10秒后仍未关闭，强制退出
      setTimeout(() => {
        console.error("❌ 强制关闭服务器");
        process.exit(1);
      }, 10000);
    };

    // 监听关闭信号
    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);
  } catch (error) {
    console.error("❌ 服务器启动失败:", error);
    process.exit(1);
  }
};

init();
