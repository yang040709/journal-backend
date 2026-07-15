import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const scheduleCallbacks: Array<() => Promise<void>> = [];

vi.mock("node-schedule", () => ({
  default: {
    scheduleJob: vi.fn((_cron: string, fn: () => Promise<void>) => {
      scheduleCallbacks.push(fn);
      return {
        cancel: vi.fn(),
        nextInvocation: () => new Date(Date.now() + 60_000),
      };
    }),
  },
}));

vi.mock("../../src/service/reminder.service", () => ({
  ReminderService: {
    reclaimStuckSending: vi.fn().mockResolvedValue(0),
    getPendingReminders: vi.fn().mockResolvedValue([]),
    sendReminder: vi.fn(),
    cleanupExpiredReminders: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  },
}));


import { ReminderService } from "../../src/service/reminder.service";
import { ReminderScheduler } from "../../src/scheduler/reminder.scheduler";

describe("scheduler: ReminderScheduler", () => {
  beforeEach(() => {
    scheduleCallbacks.length = 0;
    ReminderScheduler.stop();
    vi.mocked(ReminderService.getPendingReminders).mockClear();
    vi.mocked(ReminderService.cleanupExpiredReminders).mockClear();
  });

  afterEach(() => {
    ReminderScheduler.stop();
  });

  it("start 后 getStatus 为运行中", () => {
    ReminderScheduler.start();
    expect(ReminderScheduler.getStatus().isRunning).toBe(true);
  });

  it("cron 触发时调用 ReminderService.getPendingReminders", async () => {
    ReminderScheduler.start();
    expect(scheduleCallbacks.length).toBe(1);

    await scheduleCallbacks[0]();

    expect(ReminderService.getPendingReminders).toHaveBeenCalledOnce();
    expect(ReminderService.cleanupExpiredReminders).toHaveBeenCalledOnce();
  });

  it("处理提醒异常时不向外抛出", async () => {
    vi.mocked(ReminderService.getPendingReminders).mockRejectedValueOnce(
      new Error("mock reminder failure"),
    );
    ReminderScheduler.start();

    await expect(scheduleCallbacks[0]()).resolves.toBeUndefined();
  });

  it("stop 后 getStatus 为未运行", () => {
    ReminderScheduler.start();
    ReminderScheduler.stop();
    expect(ReminderScheduler.getStatus().isRunning).toBe(false);
  });
});
