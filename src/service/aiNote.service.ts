import OpenAI from "openai";
import UserAiUsageDaily from "../model/UserAiUsageDaily";
import { getQuotaDateContext } from "../utils/dateKey";
import { sanitizeModelText } from "./aiTextSanitize";
import {
  getAiDailyBaseLimit,
  getUserAiBonusQuota,
  rollbackAiUsage,
  reserveOneAiUsageOrThrow,
  remainingAfterUse,
} from "./aiUsageQuota";
import { AiStyleService } from "./aiStyle.service";

export type AiNoteMode = "generate" | "rewrite" | "continue";

export interface AiNoteGenerateInput {
  userId: string;
  mode: AiNoteMode;
  title?: string;
  content?: string;
  tags?: string[];
  hint?: string;
  styleKey?: string;
}

export interface AiNoteGenerateResult {
  text: string;
  remainingToday: number;
  styleKey?: string;
}

/** 与 GET /notes/ai/quota 对齐 */
export interface AiJournalQuotaSummary {
  remainingToday: number;
  dailyBaseLimit: number;
  bonusQuota: number;
  dailyTotalLimit: number;
  usedToday: number;
}

export class AiNoteService {
  private static async invokeModel(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("AI service not configured");
    }
    const baseURL = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";
    const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 60000,
      maxRetries: 0,
    });
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
    });
    return completion.choices[0]?.message?.content?.trim() || "";
  }

  /**
   * 查询今日 AI 写手帐额度（不扣减、不调用模型）
   */
  static async getQuotaSummary(userId: string): Promise<AiJournalQuotaSummary> {
    const { dateKey } = getQuotaDateContext();
    const baseLimit = await getAiDailyBaseLimit();
    const bonus = await getUserAiBonusQuota(userId);
    const dailyLimit = baseLimit + bonus;
    const doc = await UserAiUsageDaily.findOne({ userId, dateKey }).lean();
    const used = doc?.usedCount ?? 0;
    const remainingToday = Math.max(0, dailyLimit - used);
    return {
      remainingToday,
      dailyBaseLimit: baseLimit,
      bonusQuota: bonus,
      dailyTotalLimit: dailyLimit,
      usedToday: used,
    };
  }

  /** @deprecated 使用 getQuotaSummary */
  static async getRemainingToday(userId: string): Promise<AiJournalQuotaSummary> {
    return this.getQuotaSummary(userId);
  }

  static async generate(input: AiNoteGenerateInput): Promise<AiNoteGenerateResult> {
    if (input.mode === "generate") {
      if (!input.title?.trim()) {
        throw new Error("请先填写手帐标题");
      }
    } else {
      if (!input.content?.trim()) {
        throw new Error("请先填写手帐正文");
      }
    }

    const { dateKey, dailyLimit, newUsed } = await reserveOneAiUsageOrThrow(input.userId);
    const style = await AiStyleService.resolveActiveStyle(input.styleKey);
    const prompts = AiStyleService.buildPrompt(style, {
      mode: input.mode,
      title: input.title,
      content: input.content,
      tags: input.tags,
      hint: input.hint,
      today: dateKey,
    });

    try {
      const raw = await AiNoteService.invokeModel(
        prompts.systemPrompt,
        prompts.userPrompt,
      );
      const text = sanitizeModelText(raw);
      if (!text) {
        throw new Error("AI 未返回有效内容，请稍后重试");
      }

      const remainingToday = remainingAfterUse(dailyLimit, newUsed);
      return { text, remainingToday, styleKey: style.styleKey };
    } catch (e) {
      await rollbackAiUsage(input.userId, dateKey);
      throw e;
    }
  }

  static async preview(input: Omit<AiNoteGenerateInput, "userId">): Promise<{
    text: string;
    styleKey: string;
    elapsedMs: number;
    charCount: number;
    usedPrompt: { systemPrompt: string; userPrompt: string };
  }> {
    if (input.mode === "generate" && !input.title?.trim()) {
      throw new Error("请先填写手帐标题");
    }
    if ((input.mode === "rewrite" || input.mode === "continue") && !input.content?.trim()) {
      throw new Error("请先填写手帐正文");
    }
    const startedAt = Date.now();
    const { dateKey } = getQuotaDateContext();
    const style = await AiStyleService.resolveActiveStyle(input.styleKey);
    const prompts = AiStyleService.buildPrompt(style, {
      mode: input.mode,
      title: input.title,
      content: input.content,
      tags: input.tags,
      hint: input.hint,
      today: dateKey,
    });
    const raw = await AiNoteService.invokeModel(
      prompts.systemPrompt,
      prompts.userPrompt,
    );
    const text = sanitizeModelText(raw);
    if (!text) {
      throw new Error("AI 未返回有效内容，请稍后重试");
    }
    return {
      text,
      styleKey: style.styleKey,
      elapsedMs: Date.now() - startedAt,
      charCount: text.length,
      usedPrompt: prompts,
    };
  }
}
