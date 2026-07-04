import axios from "axios";
import jwt from "jsonwebtoken";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { authHeader, createAuthUser } from "../../helpers/authFactory";
import {
  clearTestDb,
  connectTestDb,
} from "../../helpers/db";
import { signToken } from "../../../src/utils/jwt";
import { ErrorCodes } from "../../../src/utils/response";

vi.mock("axios", () => ({
  default: vi.fn(),
  isAxiosError: vi.fn().mockReturnValue(false),
}));

describe("integration: /auth", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(axios).mockReset();
  });

  it("POST /auth/login mock 微信成功返回 token", async () => {
    vi.mocked(axios).mockResolvedValue({
      data: { openid: "wx-openid-login-001", session_key: "sk" },
    } as never);

    const res = await agent
      .post("/auth/login")
      .send({ code: "test-wx-code" })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.userId).toBe("wx-openid-login-001");
    expect(axios).toHaveBeenCalled();
  });

  it("POST /auth/login 缺少 code 返回 400", async () => {
    const res = await agent.post("/auth/login").send({}).expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("POST /auth/refresh 有效 token 刷新成功", async () => {
    const { userId, token } = await createAuthUser({ userId: "refresh-user" });

    const res = await agent
      .post("/auth/refresh")
      .send({ token })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.token).toBeTruthy();

    const decoded = jwt.verify(
      res.body.data.token,
      process.env.JWT_SECRET!,
    ) as { userId: string };
    expect(decoded.userId).toBe(userId);
  });

  it("POST /auth/refresh 用户不存在返回 401", async () => {
    const token = signToken({ userId: "ghost-user" });

    const res = await agent
      .post("/auth/refresh")
      .send({ token })
      .expect(401);

    expect(res.body.code).toBe(ErrorCodes.AUTH_ERROR);
  });

  it("GET /auth/me-profile 无 token 返回 401", async () => {
    const res = await agent.get("/auth/me-profile").expect(401);

    expect(res.body.code).toBe(1002);
  });

  it("GET /auth/me-profile 有效 token 返回资料", async () => {
    const { token } = await createAuthUser({
      userId: "profile-user",
      nickname: "昵称 A",
    });

    const res = await agent
      .get("/auth/me-profile")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.userId).toBe("profile-user");
    expect(res.body.data.nickname).toBe("昵称 A");
  });
});
