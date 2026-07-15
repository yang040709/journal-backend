import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { AiStyleService } from "../../../src/service/aiStyle.service";
import { AI_STYLE_SHARED_USER_PROMPT_TEMPLATE } from "../../../src/constant/aiStyleSeed";

describe("unit: AiStyleService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("seed / admin CRUD / resolve / buildPrompt", async () => {
    await AiStyleService.ensureSeed();
    const client = await AiStyleService.listEnabledForClient();
    expect(client.items.length).toBeGreaterThan(0);

    const adminList = await AiStyleService.listForAdmin();
    expect(adminList.length).toBeGreaterThan(0);

    const created = await AiStyleService.createForAdmin({
      styleKey: "style_ut_1",
      name: "单测风格",
      subtitle: "sub",
      category: "diary",
      order: 1,
      enabled: true,
      isDefault: true,
      isRecommended: true,
      systemPrompt: "sys",
      userPromptTemplate: AI_STYLE_SHARED_USER_PROMPT_TEMPLATE,
      modePrompts: { generate: "mode" },

      emojiPolicy: "low",
      outputFormat: "plain",
    } as any);
    expect(created.styleKey).toBe("style_ut_1");

    await expect(
      AiStyleService.createForAdmin({
        styleKey: "x",
        name: "y",
        systemPrompt: "s",
        userPromptTemplate: "hi {{unknown}}",
      } as any),
    ).rejects.toThrow(/未知占位符/);

    const updated = await AiStyleService.updateForAdmin(String(created._id), {
      name: "单测风格2",
      isDefault: true,
    } as any);
    expect(updated?.name).toBe("单测风格2");

    const disabled = await AiStyleService.setEnabled(String(created._id), false);
    expect(disabled?.enabled).toBe(false);

    const other = await AiStyleService.createForAdmin({
      styleKey: "style_ut_2",
      name: "备用",
      systemPrompt: "sys2",
      userPromptTemplate: AI_STYLE_SHARED_USER_PROMPT_TEMPLATE,
      enabled: true,
      isDefault: false,
    } as any);
    await AiStyleService.setEnabled(String(created._id), true);
    const asDefault = await AiStyleService.setDefault(String(other._id));
    expect(asDefault?.isDefault).toBe(true);

    const resolved = await AiStyleService.resolveActiveStyle("style_ut_2");
    expect(resolved.styleKey).toBe("style_ut_2");
    const fallback = await AiStyleService.resolveActiveStyle("missing");
    expect(fallback.enabled).toBe(true);

    const prompt = AiStyleService.buildPrompt(resolved, {
      mode: "generate",
      title: "标题",
      content: "正文",
      tags: ["a", "a", ""],
      hint: "",
      today: "2026-07-15",
    });
    expect(prompt.systemPrompt.length).toBeGreaterThan(0);
    expect(prompt.userPrompt).toContain("标题");


    expect(await AiStyleService.getByIdForAdmin(String(created._id))).toBeTruthy();
    expect(
      await AiStyleService.updateForAdmin("000000000000000000000000", {
        name: "x",
      } as any),
    ).toBeNull();
  });
});
