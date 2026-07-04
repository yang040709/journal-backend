import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("node-schedule", () => ({
  default: {
    scheduleJob: vi.fn(() => ({
      cancel: vi.fn(),
      nextInvocation: () => new Date(Date.now() + 60_000),
    })),
  },
}));

vi.mock("../../src/service/reminder.service", () => ({
  ReminderService: {
    getPendingReminders: vi.fn().mockResolvedValue([]),
    cleanupExpiredReminders: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  },
}));

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

vi.mock("../../src/service/pendingCosDelete.service", () => ({
  processPendingCosDeletes: vi.fn().mockResolvedValue({ processed: 0, succeeded: 0, failed: 0 }),
}));

import {
  getSchedulerStatus,
  startAllSchedulers,
  stopAllSchedulers,
} from "../../src/scheduler";

describe("scheduler: index", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopAllSchedulers();
  });

  afterEach(() => {
    stopAllSchedulers();
    vi.useRealTimers();
  });

  it("未启动时 getSchedulerStatus 均为未运行", () => {
    const status = getSchedulerStatus();
    expect(status.reminderScheduler.isRunning).toBe(false);
    expect(status.alertScheduler.isRunning).toBe(false);
    expect(status.cosDeleteScheduler.isRunning).toBe(false);
  });

  it("startAllSchedulers 后 getSchedulerStatus 均为运行中", async () => {
    startAllSchedulers();
    await vi.runOnlyPendingTimersAsync();

    const status = getSchedulerStatus();
    expect(status.reminderScheduler.isRunning).toBe(true);
    expect(status.alertScheduler.isRunning).toBe(true);
    expect(status.cosDeleteScheduler.isRunning).toBe(true);
  });

  it("stopAllSchedulers 后 getSchedulerStatus 均为未运行", async () => {
    startAllSchedulers();
    await vi.runOnlyPendingTimersAsync();
    stopAllSchedulers();

    const status = getSchedulerStatus();
    expect(status.reminderScheduler.isRunning).toBe(false);
    expect(status.alertScheduler.isRunning).toBe(false);
    expect(status.cosDeleteScheduler.isRunning).toBe(false);
  });
});
