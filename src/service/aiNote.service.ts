import OpenAI from "openai";
import User from "../model/User";
import UserAiUsageDaily from "../model/UserAiUsageDaily";
import { getQuotaDateContext } from "../utils/dateKey";
import { AI_NOTE_SYSTEM_PROMPT, buildAiNoteUserMessage } from "./aiNote.prompts";
import { sanitizeModelText } from "./aiTextSanitize";
import { ActivityLogger } from "../utils/ActivityLogger";
import {
  getAiDailyBaseLimit,
  getUserAiBonusQuota,
  rollbackAiUsage,
  reserveOneAiUsageOrThrow,
  remainingAfterUse,
} from "./aiUsageQuota";
import { PointsService } from "./points.service";

export type AiNoteMode = "generate" | "rewrite" | "continue";

export interface AiNoteGenerateInput {
  userId: string;
  mode: AiNoteMode;
  title?: string;
  content?: string;
  tags?: string[];
  hint?: string;
}

export interface AiNoteGenerateResult {
  text: string;
  remainingToday: number;
}

/** 与 GET /notes/ai/quota 对齐 */
export interface AiJournalQuotaSummary {
  remainingToday: number;
  dailyBaseLimit: number;
  bonusQuota: number;
  dailyTotalLimit: number;
  usedToday: number;
  todayAdRewardCount: number;
  todayAdRewardLimit: number;
}

export class AiNoteService {
  /**
   * 查询今日 AI 写手帐额度（不扣减、不调用模型），含今日激励广告观看次数
   */
  static async getQuotaSummary(userId: string): Promise<AiJournalQuotaSummary> {
    const { dateKey } = getQuotaDateContext();
    const baseLimit = getAiDailyBaseLimit();
    const bonus = await getUserAiBonusQuota(userId);
    const dailyLimit = baseLimit + bonus;
    const doc = await UserAiUsageDaily.findOne({ userId, dateKey }).lean();
    const used = doc?.usedCount ?? 0;
    const remainingToday = Math.max(0, dailyLimit - used);
    const rules = await PointsService.getRules();
    const todayAdRewardCount = await PointsService.getTodayVideoAdCount(userId);
    const todayAdRewardLimit = await PointsService.getEffectiveDailyAdLimit(userId, rules);
    return {
      remainingToday,
      dailyBaseLimit: baseLimit,
      bonusQuota: bonus,
      dailyTotalLimit: dailyLimit,
      usedToday: used,
      todayAdRewardCount,
      todayAdRewardLimit,
    };
  }

  /** @deprecated 使用 getQuotaSummary */
  static async getRemainingToday(userId: string): Promise<AiJournalQuotaSummary> {
    return this.getQuotaSummary(userId);
  }

  static async generate(input: AiNoteGenerateInput): Promise<AiNoteGenerateResult> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("AI service not configured");
    }

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

    const baseURL = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";
    const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

    const client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 60000,
      maxRetries: 0,
    });

    const userMessage = buildAiNoteUserMessage(input, dateKey);

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: AI_NOTE_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.8,
      });

      const raw = completion.choices[0]?.message?.content?.trim() || "";
      const text = sanitizeModelText(raw);
      if (!text) {
        throw new Error("AI 未返回有效内容，请稍后重试");
      }

      const remainingToday = remainingAfterUse(dailyLimit, newUsed);
      return { text, remainingToday };
    } catch (e) {
      await rollbackAiUsage(input.userId, dateKey);
      throw e;
    }
  }
}
