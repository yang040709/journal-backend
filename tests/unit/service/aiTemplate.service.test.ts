import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const reserveOneAiUsageOrThrow = vi.fn();
const rollbackAiUsage = vi.fn();
const remainingAfterUse = vi.fn(() => 3);
const recordTemplateSuccess = vi.fn();

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: (...args: unknown[]) => create(...args),
      },
    };
    constructor(_opts: unknown) {}
  },
}));

vi.mock("../../../src/service/aiUsageQuota", () => ({
  reserveOneAiUsageOrThrow: (...args: unknown[]) => reserveOneAiUsageOrThrow(...args),
  rollbackAiUsage: (...args: unknown[]) => rollbackAiUsage(...args),
  remainingAfterUse: (...args: unknown[]) => remainingAfterUse(...args),
}));

vi.mock("../../../src/service/aiConsumptionLog.service", () => ({
  AiConsumptionLogService: {
    recordTemplateSuccess: (...args: unknown[]) => recordTemplateSuccess(...args),
  },
}));

import { AiTemplateService } from "../../../src/service/aiTemplate.service";

describe("unit: AiTemplateService", () => {
  const prevKey = process.env.DEEPSEEK_API_KEY;

  beforeEach(() => {
    create.mockReset();
    reserveOneAiUsageOrThrow.mockReset();
    rollbackAiUsage.mockReset();
    remainingAfterUse.mockReset();
    recordTemplateSuccess.mockReset();
    remainingAfterUse.mockReturnValue(3);
    reserveOneAiUsageOrThrow.mockResolvedValue({
      dateKey: "2026-07-15",
      dailyLimit: 5,
      newUsed: 2,
    });
    process.env.DEEPSEEK_API_KEY = "test-key";
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prevKey;
  });

  it("未配置 / 参数校验分支", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    await expect(
      AiTemplateService.generate({
        userId: "u1",
        mode: "template_generate",
        name: "名",
      }),
    ).rejects.toThrow(/not configured/);
    process.env.DEEPSEEK_API_KEY = "test-key";

    await expect(
      AiTemplateService.generate({
        userId: "u1",
        mode: "template_generate",
        name: "  ",
      }),
    ).rejects.toThrow(/模板名称/);

    await expect(
      AiTemplateService.generate({
        userId: "u1",
        mode: "template_rewrite",
        template: { name: "n", fields: { title: "", content: "" } },
      }),
    ).rejects.toThrow(/标题模板/);
  });

  it("生成成功、解析失败、rollback", async () => {
    create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              name: "周记",
              description: null,
              fields: {
                title: "本周",
                content: "回顾：\n\n计划：",
                tags: null,
              },
            }),
          },
        },
      ],
    });
    const ok = await AiTemplateService.generate({
      userId: "u1",
      mode: "template_generate",
      name: "周记",
      description: "d",
      hint: "简洁",
    });
    expect(ok.template.name).toBe("周记");
    expect(ok.template.fields.tags).toEqual([]);
    expect(ok.remainingToday).toBe(3);
    expect(recordTemplateSuccess).toHaveBeenCalled();

    create.mockResolvedValueOnce({
      choices: [{ message: { content: "not-json" } }],
    });
    await expect(
      AiTemplateService.generate({
        userId: "u1",
        mode: "template_generate",
        name: "周记",
      }),
    ).rejects.toThrow(/解析失败/);
    expect(rollbackAiUsage).toHaveBeenCalled();

    create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({ name: "x", fields: { title: "t" } }),
          },
        },
      ],
    });
    rollbackAiUsage.mockClear();
    await expect(
      AiTemplateService.generate({
        userId: "u1",
        mode: "template_rewrite",
        template: {
          name: "旧",
          fields: { title: "标题", content: "正文", tags: ["日常"] },
        },
      }),
    ).rejects.toThrow(/格式不符合/);
    expect(rollbackAiUsage).toHaveBeenCalled();
  });
});
