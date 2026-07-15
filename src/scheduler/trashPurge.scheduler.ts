import schedule from "node-schedule";
import { TrashPurgeService } from "../service/trashPurge.service";
import { logger } from "../utils/logger";

/**
 * 每周一 03:00 Asia/Shanghai 清除过期软删手帐与手帐本。
 */
export class TrashPurgeScheduler {
  private static job: schedule.Job | null = null;

  static start(): void {
    if (this.job) {
      logger.info("软删垃圾桶周清理调度器已在运行");
      return;
    }

    const rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = 1; // Monday
    rule.hour = 3;
    rule.minute = 0;
    rule.tz = "Asia/Shanghai";

    this.job = schedule.scheduleJob(rule, async () => {
      try {
        const result = await TrashPurgeService.runWeeklyPurge();
        logger.info("软删垃圾桶周清理完成", result);
      } catch (error) {
        logger.error("软删垃圾桶周清理失败", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    logger.info(
      "软删垃圾桶周清理调度器已启动，每周一 03:00 Asia/Shanghai 执行",
    );
  }

  static stop(): void {
    if (this.job) {
      this.job.cancel();
      this.job = null;
    }
  }

  static getStatus(): { isRunning: boolean; nextInvocation?: Date } {
    return {
      isRunning: Boolean(this.job),
      nextInvocation: this.job?.nextInvocation() ?? undefined,
    };
  }
}
