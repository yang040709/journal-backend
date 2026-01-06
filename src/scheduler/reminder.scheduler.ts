import schedule from "node-schedule";
import { ReminderService } from "../service/reminder.service";

export class ReminderScheduler {
  private static job: schedule.Job | null = null;

  /**
   * 启动提醒调度器
   */
  static start(): void {
    try {
      if (this.job) {
        console.log("提醒调度器已经在运行");
        return;
      }

      // 每分钟检查一次待发送的提醒
      this.job = schedule.scheduleJob("*/1 * * * *", async () => {
        try {
          await this.processPendingReminders();
        } catch (error) {
          console.error("处理待发送提醒失败:", {
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          });
        }
      });

      console.log("提醒调度器已启动，每分钟检查一次待发送提醒");
    } catch (error: any) {
      console.error("提醒调度器启动失败:", {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
      // 重置 job 状态，允许下次重试
      this.job = null;
      throw error; // 重新抛出错误，让上层处理
    }
  }

  /**
   * 停止提醒调度器
   */
  static stop(): void {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      console.log("提醒调度器已停止");
    }
  }

  /**
   * 处理待发送的提醒
   */
  private static async processPendingReminders(): Promise<void> {
    const now = new Date();
    console.log(`[${now.toISOString()}] 检查待发送提醒...`);

    // 获取待发送的提醒（包括过去1小时内未发送的）
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const pendingReminders = await ReminderService.getPendingReminders(now);

    console.log(`找到 ${pendingReminders.length} 个待发送提醒`);

    // 并发发送提醒（限制并发数）
    const concurrencyLimit = 5;
    const batches = [];

    for (let i = 0; i < pendingReminders.length; i += concurrencyLimit) {
      batches.push(pendingReminders.slice(i, i + concurrencyLimit));
    }

    for (const batch of batches) {
      await Promise.allSettled(
        batch.map(async (reminder) => {
          try {
            console.log(`发送提醒: ${reminder.title} (ID: ${reminder.id})`);
            const success = await ReminderService.sendReminder(reminder);

            if (success) {
              console.log(`提醒发送成功: ${reminder.title}`);
            } else {
              console.warn(`提醒发送失败: ${reminder.title}`);
            }
          } catch (error: any) {
            console.error(`发送提醒异常: ${reminder.title}`, error);
          }
        })
      );
    }

    // 清理过期的失败提醒（超过24小时）
    await this.cleanupExpiredReminders();
  }

  /**
   * 清理过期的失败提醒
   */
  private static async cleanupExpiredReminders(): Promise<void> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      // 清理逻辑：
      // 1. 删除超过24小时且发送失败的提醒
      // 2. 同时清理超过24小时且已取消订阅的提醒
      // 3. 保留已发送成功的提醒供用户查看

      const deleteResult = await ReminderService.cleanupExpiredReminders(
        twentyFourHoursAgo
      );

      if (deleteResult.deletedCount > 0) {
        console.log(`清理了 ${deleteResult.deletedCount} 个过期提醒`);
      } else {
        console.log("没有需要清理的过期提醒");
      }
    } catch (error) {
      console.error("清理过期提醒失败:", error);
    }
  }

  /**
   * 立即发送指定提醒（用于测试）
   */
  static async sendReminderImmediately(reminderId: string): Promise<boolean> {
    try {
      // 这里需要根据实际情况获取提醒
      // 由于这是一个静态方法，我们暂时不实现具体逻辑
      console.log(`立即发送提醒: ${reminderId}`);
      return true;
    } catch (error) {
      console.error("立即发送提醒失败:", error);
      return false;
    }
  }

  /**
   * 获取调度器状态
   */
  static getStatus(): {
    isRunning: boolean;
    nextInvocation?: Date;
  } {
    if (!this.job) {
      return { isRunning: false };
    }

    return {
      isRunning: true,
      nextInvocation: this.job.nextInvocation(),
    };
  }
}
