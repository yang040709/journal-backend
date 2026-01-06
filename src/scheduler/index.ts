import { ReminderScheduler } from "./reminder.scheduler";

/**
 * 启动所有调度器
 */
export function startAllSchedulers(): void {
  console.log("启动所有调度器...");

  try {
    // 启动提醒调度器
    ReminderScheduler.start();
    console.log("所有调度器已启动");
  } catch (error: any) {
    console.error("调度器启动失败，但不会终止后端进程:", {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    console.log("调度器将在下次重启时重试");
  }
}

/**
 * 停止所有调度器
 */
export function stopAllSchedulers(): void {
  console.log("停止所有调度器...");

  // 停止提醒调度器
  ReminderScheduler.stop();

  console.log("所有调度器已停止");
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
