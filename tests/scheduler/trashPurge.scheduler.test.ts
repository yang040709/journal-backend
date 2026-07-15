import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const scheduleCallbacks: Array<() => Promise<void>> = [];
const scheduleRules: unknown[] = [];

vi.mock("node-schedule", () => {
  class RecurrenceRule {
    dayOfWeek?: number;
    hour?: number;
    minute?: number;
    tz?: string;
  }
  return {
    default: {
      scheduleJob: vi.fn((rule: unknown, fn: () => Promise<void>) => {
        scheduleRules.push(rule);
        scheduleCallbacks.push(fn);
        return {
          cancel: vi.fn(),
          nextInvocation: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };
      }),
      RecurrenceRule,
    },
  };
});

vi.mock("../../src/service/trashPurge.service", () => ({
  TrashPurgeService: {
    runWeeklyPurge: vi.fn().mockResolvedValue({
      notes: { purged: 0, total: 0, errors: 0 },
      notebooks: { purged: 0, total: 0, errors: 0 },
    }),
  },
}));

import schedule from "node-schedule";
import { TrashPurgeService } from "../../src/service/trashPurge.service";
import { TrashPurgeScheduler } from "../../src/scheduler/trashPurge.scheduler";

describe("scheduler: TrashPurgeScheduler", () => {
  beforeEach(() => {
    scheduleCallbacks.length = 0;
    scheduleRules.length = 0;
    TrashPurgeScheduler.stop();
    vi.mocked(schedule.scheduleJob).mockClear();
    vi.mocked(TrashPurgeService.runWeeklyPurge).mockClear();
    vi.mocked(TrashPurgeService.runWeeklyPurge).mockResolvedValue({
      notes: { purged: 0, total: 0, errors: 0 },
      notebooks: { purged: 0, total: 0, errors: 0 },
    });
  });

  afterEach(() => {
    TrashPurgeScheduler.stop();
  });

  it("start 后注册 Asia/Shanghai 周一 03:00 规则", () => {
    TrashPurgeScheduler.start();
    expect(TrashPurgeScheduler.getStatus().isRunning).toBe(true);
    expect(schedule.scheduleJob).toHaveBeenCalledOnce();
    const rule = scheduleRules[0] as {
      dayOfWeek: number;
      hour: number;
      minute: number;
      tz: string;
    };
    expect(rule.dayOfWeek).toBe(1);
    expect(rule.hour).toBe(3);
    expect(rule.minute).toBe(0);
    expect(rule.tz).toBe("Asia/Shanghai");
  });

  it("cron 触发时调用 runWeeklyPurge", async () => {
    TrashPurgeScheduler.start();
    expect(scheduleCallbacks.length).toBe(1);
    await scheduleCallbacks[0]();
    expect(TrashPurgeService.runWeeklyPurge).toHaveBeenCalledOnce();
  });

  it("处理失败时不向外抛出", async () => {
    TrashPurgeScheduler.start();
    vi.mocked(TrashPurgeService.runWeeklyPurge).mockRejectedValueOnce(
      new Error("mock purge fail"),
    );
    await expect(scheduleCallbacks[0]()).resolves.toBeUndefined();
  });

  it("stop 后 getStatus 为未运行", () => {
    TrashPurgeScheduler.start();
    TrashPurgeScheduler.stop();
    expect(TrashPurgeScheduler.getStatus().isRunning).toBe(false);
  });
});
