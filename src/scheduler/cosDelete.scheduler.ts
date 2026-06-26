import schedule from "node-schedule";
import { processPendingCosDeletes } from "../service/pendingCosDelete.service";
import { logger } from "../utils/logger";

const BATCH_LIMIT = 100;

export class CosDeleteScheduler {
  private static job: schedule.Job | null = null;

  static start(): void {
    if (this.job) {
      logger.info("COS 删除队列调度器已在运行");
      return;
    }

    this.job = schedule.scheduleJob("*/2 * * * *", async () => {
      try {
        const result = await processPendingCosDeletes(BATCH_LIMIT);
        if (result.processed > 0) {
          logger.info("COS 删除队列处理完成", result);
        }
      } catch (error) {
        logger.error("COS 删除队列处理失败", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    logger.info("COS 删除队列调度器已启动，每 2 分钟处理一次");
    void processPendingCosDeletes(BATCH_LIMIT).catch((error) => {
      logger.error("COS 删除队列启动时处理失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  static stop(): void {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      logger.info("COS 删除队列调度器已停止");
    }
  }

  static getStatus(): { isRunning: boolean; nextInvocation?: Date } {
    return {
      isRunning: Boolean(this.job),
      nextInvocation: this.job?.nextInvocation(),
    };
  }
}
