import { logger } from "../utils/logger";
import { AlertEngineService } from "../service/alertEngine.service";
import { AlertRuleService } from "../service/alertRule.service";

const RUN_INTERVAL_MS = 60 * 1000;

class AlertSchedulerImpl {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight = false;
  private initialized = false;
  private nextInvocation?: Date;

  async runOnce() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      if (!this.initialized) {
        await AlertRuleService.ensureDefaultRules();
        this.initialized = true;
      }
      await AlertEngineService.evaluateAllRules();
    } catch (error) {
      logger.error("告警调度执行失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.inFlight = false;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.nextInvocation = new Date(Date.now() + RUN_INTERVAL_MS);
    this.timer = setInterval(() => {
      this.nextInvocation = new Date(Date.now() + RUN_INTERVAL_MS);
      void this.runOnce();
    }, RUN_INTERVAL_MS);
    void this.runOnce();
    logger.info("告警调度器已启动", { intervalMs: RUN_INTERVAL_MS });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.nextInvocation = undefined;
    logger.info("告警调度器已停止");
  }

  getStatus() {
    return {
      isRunning: this.running,
      nextInvocation: this.nextInvocation,
    };
  }
}

export const AlertScheduler = new AlertSchedulerImpl();
