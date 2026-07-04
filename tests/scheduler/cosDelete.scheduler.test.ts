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
        nextInvocation: () => new Date(Date.now() + 120_000),
      };
    }),
  },
}));

vi.mock("../../src/service/pendingCosDelete.service", () => ({
  processPendingCosDeletes: vi.fn().mockResolvedValue({ processed: 0, succeeded: 0, failed: 0 }),
}));

import { processPendingCosDeletes } from "../../src/service/pendingCosDelete.service";
import { CosDeleteScheduler } from "../../src/scheduler/cosDelete.scheduler";

describe("scheduler: CosDeleteScheduler", () => {
  beforeEach(() => {
    scheduleCallbacks.length = 0;
    CosDeleteScheduler.stop();
    vi.mocked(processPendingCosDeletes).mockClear();
    vi.mocked(processPendingCosDeletes).mockResolvedValue({
      processed: 0,
      succeeded: 0,
      failed: 0,
    });
  });

  afterEach(() => {
    CosDeleteScheduler.stop();
  });

  it("start 后 getStatus 为运行中", () => {
    CosDeleteScheduler.start();
    expect(CosDeleteScheduler.getStatus().isRunning).toBe(true);
  });

  it("start 时立即处理一次待删队列", async () => {
    CosDeleteScheduler.start();
    await Promise.resolve();

    expect(processPendingCosDeletes).toHaveBeenCalled();
  });

  it("cron 触发时调用 processPendingCosDeletes", async () => {
    CosDeleteScheduler.start();
    await Promise.resolve();
    vi.mocked(processPendingCosDeletes).mockClear();

    expect(scheduleCallbacks.length).toBe(1);
    await scheduleCallbacks[0]();

    expect(processPendingCosDeletes).toHaveBeenCalledWith(100);
  });

  it("处理失败时不向外抛出", async () => {
    vi.mocked(processPendingCosDeletes).mockRejectedValueOnce(
      new Error("mock cos delete failure"),
    );
    CosDeleteScheduler.start();
    await Promise.resolve();
    vi.mocked(processPendingCosDeletes).mockClear();
    vi.mocked(processPendingCosDeletes).mockRejectedValueOnce(
      new Error("mock cos delete failure"),
    );

    await expect(scheduleCallbacks[0]()).resolves.toBeUndefined();
  });

  it("stop 后 getStatus 为未运行", () => {
    CosDeleteScheduler.start();
    CosDeleteScheduler.stop();
    expect(CosDeleteScheduler.getStatus().isRunning).toBe(false);
  });
});
