import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminCaptchaService } from "../../../src/service/adminCaptcha.service";
import { AdminLoginRateLimitService } from "../../../src/service/adminLoginRateLimit.service";

describe("unit: AdminCaptchaService", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_LOGIN_CAPTCHA_STORE", "memory");
    AdminCaptchaService.resetForTest();
    AdminLoginRateLimitService.resetForTest();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    AdminCaptchaService.resetForTest();
    AdminLoginRateLimitService.resetForTest();
  });

  it("createChallenge 返回 captchaId 与 imageBase64", async () => {
    const result = await AdminCaptchaService.createChallenge("127.0.0.1");
    expect(result.captchaId).toBeTruthy();
    expect(result.imageBase64.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(result.expiresIn).toBeGreaterThan(0);
  });

  it("verifyAndConsume 正确验证码一次性通过", async () => {
    const { captchaId, captchaCode } =
      await AdminCaptchaService.createChallengeForTest("abcd");
    await expect(
      AdminCaptchaService.verifyAndConsume(captchaId, captchaCode),
    ).resolves.toBeUndefined();
    await expect(
      AdminCaptchaService.verifyAndConsume(captchaId, captchaCode),
    ).rejects.toThrow("验证码错误或已过期");
  });

  it("verifyAndConsume 错误验证码拒绝", async () => {
    const { captchaId } = await AdminCaptchaService.createChallengeForTest("abcd");
    await expect(
      AdminCaptchaService.verifyAndConsume(captchaId, "wrong"),
    ).rejects.toThrow("验证码错误或已过期");
  });

  it("verifyAndConsume 过期验证码拒绝", async () => {
    vi.useFakeTimers();
    try {
      const { captchaId, captchaCode } =
        await AdminCaptchaService.createChallengeForTest("abcd");
      vi.advanceTimersByTime(121_000);
      await expect(
        AdminCaptchaService.verifyAndConsume(captchaId, captchaCode),
      ).rejects.toThrow("验证码错误或已过期");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("unit: AdminLoginRateLimitService (memory windows)", () => {
  beforeEach(() => {
    AdminLoginRateLimitService.resetForTest();
    vi.stubEnv("ADMIN_LOGIN_IP_LIMIT", "10");
    vi.stubEnv("ADMIN_LOGIN_USERNAME_LIMIT", "5");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    AdminLoginRateLimitService.resetForTest();
  });

  it("IP 第 11 次/min 拒绝", () => {
    for (let i = 0; i < 10; i += 1) {
      AdminLoginRateLimitService.consumeIpLimit("1.2.3.4");
    }
    expect(() => AdminLoginRateLimitService.consumeIpLimit("1.2.3.4")).toThrow(
      "登录尝试过于频繁",
    );
  });

  it("username 第 6 次/min 拒绝", () => {
    for (let i = 0; i < 5; i += 1) {
      AdminLoginRateLimitService.consumeUsernameLimit("TestAdmin");
    }
    expect(() => AdminLoginRateLimitService.consumeUsernameLimit("testadmin")).toThrow(
      "该账号登录尝试过于频繁",
    );
  });
});
