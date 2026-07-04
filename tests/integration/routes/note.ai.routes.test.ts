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
import { seedDefaultAiStyle } from "../../helpers/seed/aiStyle.seed";
import { AiNoteService } from "../../../src/service/aiNote.service";
import UserAiUsageDaily from "../../../src/model/UserAiUsageDaily";
import { getQuotaDateContext } from "../../../src/utils/dateKey";

describe("integration: /notes/ai", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    await seedDefaultAiStyle();
    vi.restoreAllMocks();
  });

  it("GET /notes/ai/quota 不扣减当日次数", async () => {
    const { token, userId } = await createAuthUser();

    const first = await agent
      .get("/notes/ai/quota")
      .set(authHeader(token))
      .expect(200);
    const second = await agent
      .get("/notes/ai/quota")
      .set(authHeader(token))
      .expect(200);

    expect(first.body.code).toBe(0);
    expect(second.body.data.usedToday).toBe(first.body.data.usedToday);
    expect(second.body.data.remainingToday).toBe(first.body.data.remainingToday);

    const { dateKey } = getQuotaDateContext();
    const doc = await UserAiUsageDaily.findOne({ userId, dateKey }).lean();
    expect(doc?.usedCount ?? 0).toBe(0);
  });

  it("POST /notes/ai/generate mock 模型成功并扣减次数", async () => {
    const { token, userId } = await createAuthUser();
    vi.spyOn(AiNoteService as any, "invokeModel").mockResolvedValue(
      "这是一段 AI 生成的手帐正文。",
    );

    const quotaBefore = await agent
      .get("/notes/ai/quota")
      .set(authHeader(token))
      .expect(200);

    const res = await agent
      .post("/notes/ai/generate")
      .set(authHeader(token))
      .send({
        mode: "generate",
        title: "周末散步",
        tags: [],
      })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.text).toContain("AI 生成");

    const quotaAfter = await agent
      .get("/notes/ai/quota")
      .set(authHeader(token))
      .expect(200);

    expect(quotaAfter.body.data.usedToday).toBe(quotaBefore.body.data.usedToday + 1);
    expect(quotaAfter.body.data.remainingToday).toBe(
      quotaBefore.body.data.remainingToday - 1,
    );
  });

  it("POST /notes/ai/generate 未配置 API Key 返回 500 且不扣减", async () => {
    const { token } = await createAuthUser();
    const savedKey = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    const quotaBefore = await agent
      .get("/notes/ai/quota")
      .set(authHeader(token))
      .expect(200);

    const res = await agent
      .post("/notes/ai/generate")
      .set(authHeader(token))
      .send({
        mode: "generate",
        title: "测试标题",
      })
      .expect(500);

    expect(res.body.message).toContain("AI 服务未配置");

    const quotaAfter = await agent
      .get("/notes/ai/quota")
      .set(authHeader(token))
      .expect(200);
    expect(quotaAfter.body.data.usedToday).toBe(quotaBefore.body.data.usedToday);

    process.env.DEEPSEEK_API_KEY = savedKey;
  });
});
