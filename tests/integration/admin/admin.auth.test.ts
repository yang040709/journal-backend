import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import {
  adminAuthHeader,
  seedAdmin,
} from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { ErrorCodes } from "../../../src/utils/response";

describe("integration: admin auth", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("POST /admin/auth/login 成功返回 token", async () => {
    await seedAdmin();

    const res = await agent
      .post("/admin/auth/login")
      .send({
        username: "testadmin",
        password: "testadminpass",
      })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.admin.username).toBe("testadmin");
    expect(res.body.data.admin.role).toBe("super");
  });

  it("POST /admin/auth/login 密码错误返回 400", async () => {
    await seedAdmin();

    const res = await agent
      .post("/admin/auth/login")
      .send({
        username: "testadmin",
        password: "wrong-password",
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.USER_CREDENTIALS_ERROR);
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
