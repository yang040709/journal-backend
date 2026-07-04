import STS from "qcloud-cos-sts";
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
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUploadQuotaExhausted } from "../../helpers/seed/quota.seed";
import { ErrorCodes } from "../../../src/utils/response";

vi.mock("qcloud-cos-sts", () => ({
  default: {
    getCredential: vi.fn(),
  },
}));

const stsPayload = {
  expiredTime: Math.floor(Date.now() / 1000) + 1800,
  credentials: {
    tmpSecretId: "tmp-id",
    tmpSecretKey: "tmp-key",
    sessionToken: "tmp-token",
  },
};

describe("integration: /api/upload", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(STS.getCredential).mockReset();
    vi.mocked(STS.getCredential).mockResolvedValue(stsPayload as never);
  });

  it("GET /api/upload/quota 无 token 返回 401", async () => {
    await agent.get("/api/upload/quota").expect(401);
  });

  it("GET /api/upload/quota 返回额度摘要", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .get("/api/upload/quota")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      todayUsedCount: 0,
      todayRemaining: expect.any(Number),
    });
  });

  it("POST /api/upload/cos/sts mock COS 成功并扣减额度", async () => {
    const { token, userId } = await createAuthUser();

    const res = await agent
      .post("/api/upload/cos/sts")
      .set(authHeader(token))
      .send({
        biz: "note",
        fileName: "photo.jpg",
        fileType: "image/jpeg",
        fileSize: 1024,
      })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.key).toContain(userId);
    expect(STS.getCredential).toHaveBeenCalledOnce();

    const quotaRes = await agent
      .get("/api/upload/quota")
      .set(authHeader(token))
      .expect(200);
    expect(quotaRes.body.data.todayUsedCount).toBe(1);
  });

  it("POST /api/upload/cos/sts 额度不足拒绝", async () => {
    const { token, userId } = await createAuthUser();
    await seedUploadQuotaExhausted(userId);

    const res = await agent
      .post("/api/upload/cos/sts")
      .set(authHeader(token))
      .send({
        biz: "note",
        fileName: "photo.jpg",
        fileType: "image/jpeg",
        fileSize: 1024,
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.UPLOAD_DAILY_LIMIT_EXCEEDED);
    expect(STS.getCredential).not.toHaveBeenCalled();
  });
});
