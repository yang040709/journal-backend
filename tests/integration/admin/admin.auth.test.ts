import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import {
  adminAuthHeader,
  createLoginCaptcha,
  loginAdminAgent,
  seedAdmin,
} from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { AdminLoginRateLimitService } from "../../../src/service/adminLoginRateLimit.service";
import { ErrorCodes } from "../../../src/utils/response";

describe("integration: admin auth", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    AdminLoginRateLimitService.resetForTest();
    vi.stubEnv("ADMIN_LOGIN_CAPTCHA_ENABLED", "true");
    vi.stubEnv("ADMIN_LOGIN_CAPTCHA_STORE", "mongo");
    vi.stubEnv("ADMIN_LOGIN_IP_LIMIT", "10");
    vi.stubEnv("ADMIN_LOGIN_USERNAME_LIMIT", "5");
    vi.stubEnv("ADMIN_LOGIN_LOCK_FAIL_THRESHOLD", "10");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    AdminLoginRateLimitService.resetForTest();
  });

  it("GET /admin/auth/captcha 返回 captchaId 与 imageBase64", async () => {
    const res = await agent.get("/admin/auth/captcha").expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.captchaId).toBeTruthy();
    expect(res.body.data.imageBase64).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(res.body.data.expiresIn).toBeGreaterThan(0);
  });

  it("POST /admin/auth/login 成功返回 token", async () => {
    await seedAdmin();

    const res = await loginAdminAgent(agent);
    expect(res.status).toBe(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.admin.username).toBe("testadmin");
    expect(res.body.data.admin.role).toBe("super");
  });

  it("POST /admin/auth/login 密码错误返回 400", async () => {
    await seedAdmin();
    const { captchaId, captchaCode } = await createLoginCaptcha();

    const res = await agent
      .post("/admin/auth/login")
      .send({
        username: "testadmin",
        password: "wrong-password",
        captchaId,
        captchaCode,
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.USER_CREDENTIALS_ERROR);
  });

  it("POST /admin/auth/login 验证码错误返回 4401", async () => {
    await seedAdmin();
    const { captchaId } = await createLoginCaptcha();

    const res = await agent
      .post("/admin/auth/login")
      .send({
        username: "testadmin",
        password: "testadminpass",
        captchaId,
        captchaCode: "wrong",
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.ADMIN_LOGIN_CAPTCHA_ERROR);
  });

  it("POST /admin/auth/login 超 IP 限流返回 429", async () => {
    await seedAdmin();

    for (let i = 0; i < 10; i += 1) {
      const { captchaId, captchaCode } = await createLoginCaptcha();
      await agent
        .post("/admin/auth/login")
        .send({
          username: `rate-limit-user-${i}`,
          password: "wrong-password",
          captchaId,
          captchaCode,
        })
        .expect(400);
    }

    const { captchaId, captchaCode } = await createLoginCaptcha();
    const res = await agent
      .post("/admin/auth/login")
      .send({
        username: "testadmin",
        password: "testadminpass",
        captchaId,
        captchaCode,
      })
      .expect(429);

    expect(res.body.code).toBe(ErrorCodes.TOO_MANY_REQUESTS);
  });

  it("POST /admin/auth/login 连续密码失败后锁定返回 429", async () => {
    await seedAdmin();
    vi.stubEnv("ADMIN_LOGIN_LOCK_FAIL_THRESHOLD", "3");
    vi.stubEnv("ADMIN_LOGIN_IP_LIMIT", "100");
    vi.stubEnv("ADMIN_LOGIN_USERNAME_LIMIT", "100");

    for (let i = 0; i < 3; i += 1) {
      const { captchaId, captchaCode } = await createLoginCaptcha();
      await agent
        .post("/admin/auth/login")
        .send({
          username: "testadmin",
          password: "wrong-password",
          captchaId,
          captchaCode,
        })
        .expect(400);
    }

    const { captchaId, captchaCode } = await createLoginCaptcha();
    const res = await agent
      .post("/admin/auth/login")
      .send({
        username: "testadmin",
        password: "testadminpass",
        captchaId,
        captchaCode,
      })
      .expect(429);

    expect(res.body.code).toBe(ErrorCodes.TOO_MANY_REQUESTS);
    expect(res.body.message).toContain("账号已锁定");
  });

  it("GET /admin/auth/me 无 token 返回 401", async () => {
    const res = await agent.get("/admin/auth/me").expect(401);
    expect(res.body.code).toBe(ErrorCodes.AUTH_ERROR);
  });

  it("GET /admin/auth/me 有效 token 返回管理员信息", async () => {
    const { token, username } = await seedAdmin();

    const res = await agent
      .get("/admin/auth/me")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.username).toBe(username);
    expect(res.body.data.role).toBe("super");
  });
});
