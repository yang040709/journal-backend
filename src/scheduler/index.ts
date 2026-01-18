import { ReminderScheduler } from "./reminder.scheduler";
import { logger } from "../utils/logger";

/**
 * 启动所有调度器
 */
export function startAllSchedulers(): void {
  logger.info("启动所有调度器...");

  try {
    // 启动提醒调度器
    ReminderScheduler.start();
    logger.info("所有调度器已启动");
  } catch (error: any) {
    logger.error("调度器启动失败，但不会终止后端进程", {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      timestamp: new Date().toISOString(),
    });
    logger.info("调度器将在下次重启时重试");
  }
}

/**
 * 停止所有调度器
 */
export function stopAllSchedulers(): void {
  logger.info("停止所有调度器...");

  // 停止提醒调度器
  ReminderScheduler.stop();

  logger.info("所有调度器已停止");
}

/**
 * 获取调度器状态
 */
export function getSchedulerStatus(): {
  reminderScheduler: {
    isRunning: boolean;
    nextInvocation?: Date;
  };
} {
  return {
    reminderScheduler: ReminderScheduler.getStatus(),
  };
}

export { ReminderScheduler } from "./reminder.scheduler";
