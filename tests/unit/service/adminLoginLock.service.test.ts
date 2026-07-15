import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { connectTestDb, clearTestDb } from "../../helpers/db";
import { AdminLoginRateLimitService } from "../../../src/service/adminLoginRateLimit.service";
import AdminLoginLock from "../../../src/model/AdminLoginLock";

describe("unit: AdminLoginRateLimitService (lock)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    AdminLoginRateLimitService.resetForTest();
    vi.stubEnv("ADMIN_LOGIN_LOCK_FAIL_THRESHOLD", "10");
    vi.stubEnv("ADMIN_LOGIN_LOCK_MINUTES", "15");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    AdminLoginRateLimitService.resetForTest();
  });

  it("连续 10 次密码失败后锁定账号", async () => {
    for (let i = 0; i < 10; i += 1) {
      await AdminLoginRateLimitService.recordPasswordFail("locked-user");
    }
    const doc = await AdminLoginLock.findOne({ username: "locked-user" }).lean();
    expect(doc?.failStreak).toBe(10);
    expect(doc?.lockedUntil).toBeTruthy();
    await expect(
      AdminLoginRateLimitService.assertNotLocked("locked-user"),
    ).rejects.toThrow("账号已锁定");
  });

  it("登录成功后清除失败计数", async () => {
    await AdminLoginRateLimitService.recordPasswordFail("clear-user");
    await AdminLoginRateLimitService.clearFailStreak("clear-user");
    const doc = await AdminLoginLock.findOne({ username: "clear-user" }).lean();
    expect(doc).toBeNull();
    await expect(
      AdminLoginRateLimitService.assertNotLocked("clear-user"),
    ).resolves.toBeUndefined();
  });
});
