import OpenAI from "openai";
import { z } from "zod";
import { AI_TEMPLATE_SYSTEM_PROMPT, buildAiTemplateUserMessage } from "./aiTemplate.prompts";
import { sanitizeModelText } from "./aiTextSanitize";
import { rollbackAiUsage, reserveOneAiUsageOrThrow, remainingAfterUse } from "./aiUsageQuota";

export type AiTemplateMode = "template_generate" | "template_rewrite";

export interface AiTemplateGenerateInput {
  userId: string;
  mode: AiTemplateMode;
  name?: string;
  description?: string;
  hint?: string;
  template?: {
    name: string;
    description?: string;
    fields: {
      title: string;
      content: string;
      tags?: string[];
    };
  };
}

export interface AiTemplatePayload {
  name: string;
  description: string;
  fields: {
    title: string;
    content: string;
    tags: string[];
  };
}

export interface AiTemplateGenerateResult {
  template: AiTemplatePayload;
  remainingToday: number;
}

const aiTemplateOutputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  fields: z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(12000),
    tags: z.array(z.string()).max(20).default([]),
  }),
});

const parseTemplateJson = (raw: string): AiTemplatePayload => {
  const cleaned = sanitizeModelText(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI 返回不是合法 JSON，请重试");
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    if (o.description == null) o.description = "";
    const f = o.fields;
    if (f && typeof f === "object" && !Array.isArray(f)) {
      const fo = f as Record<string, unknown>;
      if (fo.tags == null) fo.tags = [];
    }
  }
  const result = aiTemplateOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("AI 返回的模板格式不符合要求，请重试");
  }
  const d = result.data;
  return {
    name: d.name.trim(),
    description: (d.description || "").trim(),
    fields: {
      title: d.fields.title.trim(),
      content: d.fields.content.trim(),
      tags: (d.fields.tags || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 20),
    },
  };
};

export class AiTemplateService {
  static async generate(input: AiTemplateGenerateInput): Promise<AiTemplateGenerateResult> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("AI service not configured");
    }

    if (input.mode === "template_generate") {
      if (!input.name?.trim()) {
        throw new Error("请先填写模板名称");
      }
    } else {
      const t = input.template;
      if (!t?.fields?.title?.trim() || !t?.fields?.content?.trim()) {
        throw new Error("请先填写标题模板与内容模板后再改写");
      }
    }

    const { dateKey, dailyLimit, newUsed } = await reserveOneAiUsageOrThrow(input.userId);

    const baseURL = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";
    const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

    const client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 60000,
      maxRetries: 0,
    });

    const userMessage = buildAiTemplateUserMessage({
      mode: input.mode,
      name: input.name,
      description: input.description,
      hint: input.hint,
      template: input.template,
    });

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: AI_TEMPLATE_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.75,
      });

      const raw = completion.choices[0]?.message?.content?.trim() || "";
      const template = parseTemplateJson(raw);
      const remainingToday = remainingAfterUse(dailyLimit, newUsed);
      return { template, remainingToday };
    } catch (e) {
      await rollbackAiUsage(input.userId, dateKey);
      throw e;
    }
  }
}
