import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AiNoteService } from "../../../src/service/aiNote.service";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedDefaultAiStyle } from "../../helpers/seed/aiStyle.seed";
import { seedUser } from "../../helpers/seed/user.seed";

describe("contract: AiNoteService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    await seedDefaultAiStyle();
    vi.restoreAllMocks();
  });

  it("未配置 DEEPSEEK_API_KEY 时 generate 失败且不扣减额度", async () => {
    const { userId } = await seedUser();
    const savedKey = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    const before = await AiNoteService.getQuotaSummary(userId);

    await expect(
      AiNoteService.generate({
        userId,
        mode: "generate",
        title: "测试标题",
      }),
    ).rejects.toThrow("AI service not configured");

    const after = await AiNoteService.getQuotaSummary(userId);
    expect(after.usedToday).toBe(before.usedToday);

    process.env.DEEPSEEK_API_KEY = savedKey;
  });

  it("mock invokeModel 时 generate 成功并扣减额度", async () => {
    const { userId } = await seedUser();
    vi.spyOn(AiNoteService as any, "invokeModel").mockResolvedValue(
      "模型输出正文",
    );

    const before = await AiNoteService.getQuotaSummary(userId);
    const result = await AiNoteService.generate({
      userId,
      mode: "generate",
      title: "测试标题",
    });

    expect(result.text).toBe("模型输出正文");
    const after = await AiNoteService.getQuotaSummary(userId);
    expect(after.usedToday).toBe(before.usedToday + 1);
  });
});
