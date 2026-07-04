import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("../../src/service/alertEngine.service", () => ({
  AlertEngineService: {
    evaluateAllRules: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../src/service/alertRule.service", () => ({
  AlertRuleService: {
    ensureDefaultRules: vi.fn().mockResolvedValue(undefined),
  },
}));

import { AlertEngineService } from "../../src/service/alertEngine.service";
import { AlertRuleService } from "../../src/service/alertRule.service";
import { AlertScheduler } from "../../src/scheduler/alert.scheduler";

describe("scheduler: AlertScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    AlertScheduler.stop();
    vi.mocked(AlertRuleService.ensureDefaultRules).mockClear();
    vi.mocked(AlertEngineService.evaluateAllRules).mockClear();
  });

  afterEach(() => {
    AlertScheduler.stop();
    vi.useRealTimers();
  });

  it("start 后立即初始化规则并评估一次", async () => {
    AlertScheduler.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(AlertScheduler.getStatus().isRunning).toBe(true);
    expect(AlertRuleService.ensureDefaultRules).toHaveBeenCalledOnce();
    expect(AlertEngineService.evaluateAllRules).toHaveBeenCalledOnce();
  });

  it("定时器触发后再次评估规则", async () => {
    AlertScheduler.start();
    await Promise.resolve();
    await Promise.resolve();
    vi.mocked(AlertEngineService.evaluateAllRules).mockClear();

    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.resolve();

    expect(AlertEngineService.evaluateAllRules).toHaveBeenCalledOnce();
  });

  it("evaluateAllRules 失败时不 crash 调度器", async () => {
    vi.mocked(AlertEngineService.evaluateAllRules).mockRejectedValueOnce(
      new Error("mock alert failure"),
    );
    AlertScheduler.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(AlertScheduler.getStatus().isRunning).toBe(true);
  });

  it("stop 后 getStatus 为未运行", async () => {
    AlertScheduler.start();
    await Promise.resolve();
    AlertScheduler.stop();
    expect(AlertScheduler.getStatus().isRunning).toBe(false);
  });
});
