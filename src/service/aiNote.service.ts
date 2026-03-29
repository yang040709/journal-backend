import OpenAI from "openai";
import User from "../model/User";
import UserAiUsageDaily from "../model/UserAiUsageDaily";
import UserAdRewardLog from "../model/UserAdRewardLog";
import { getQuotaDateContext } from "../utils/dateKey";
import { AI_NOTE_SYSTEM_PROMPT, buildAiNoteUserMessage } from "./aiNote.prompts";
import { sanitizeModelText } from "./aiTextSanitize";
import {
  getAiDailyBaseLimit,
  getUserAiBonusQuota,
  rollbackAiUsage,
  reserveOneAiUsageOrThrow,
  remainingAfterUse,
} from "./aiUsageQuota";

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

export interface GrantAiJournalAdRewardInput {
  adProvider: string;
  adUnitId: string;
  rewardToken: string;
  requestId?: string;
}

export interface GrantAiJournalAdRewardResult {
  rewardQuota: number;
  bonusQuota: number;
  duplicated: boolean;
}

export class AiJournalAdRewardInvalidError extends Error {
  public readonly code = "AI_JOURNAL_AD_REWARD_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "AiJournalAdRewardInvalidError";
  }
}

export class AiJournalAdRewardDailyLimitExceededError extends Error {
  public readonly code = "AI_JOURNAL_AD_REWARD_DAILY_LIMIT_EXCEEDED";
  public readonly details: { todayAdRewardCount: number; todayAdRewardLimit: number };

  constructor(details: { todayAdRewardCount: number; todayAdRewardLimit: number }) {
    super(`今日观看广告次数已达上限（${details.todayAdRewardCount}/${details.todayAdRewardLimit}次），明日再来`);
    this.name = "AiJournalAdRewardDailyLimitExceededError";
    this.details = details;
  }
}

const getAiAdRewardValue = (): number => {
  const parsed = Number(process.env.AI_AD_REWARD_VALUE ?? 5);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.floor(parsed);
};

const getAiDailyAdRewardLimit = (): number => {
  const parsed = Number(process.env.AI_AD_REWARD_DAILY_LIMIT ?? 6);
  if (!Number.isFinite(parsed) || parsed <= 0) return 6;
  return Math.floor(parsed);
};

const getTodayAiAdRewardCount = async (userId: string): Promise<number> => {
  const { dateKey } = getQuotaDateContext();
  const startOfDay = new Date(`${dateKey}T00:00:00+08:00`);
  const endOfDay = new Date(`${dateKey}T23:59:59.999+08:00`);
  const count = await UserAdRewardLog.countDocuments({
    userId,
    rewardType: "ai_journal_quota",
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });
  return Math.max(0, count);
};

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
    const todayAdRewardCount = await getTodayAiAdRewardCount(userId);
    const todayAdRewardLimit = getAiDailyAdRewardLimit();
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

  static async grantAiJournalAdReward(
    userId: string,
    input: GrantAiJournalAdRewardInput,
  ): Promise<GrantAiJournalAdRewardResult> {
    const rewardToken = String(input.rewardToken || "").trim();
    if (!rewardToken) {
      throw new AiJournalAdRewardInvalidError("奖励凭证不能为空");
    }

    const existed = await UserAdRewardLog.findOne({ rewardToken }).lean();
    if (existed) {
      if (existed.userId !== userId) {
        throw new AiJournalAdRewardInvalidError("奖励凭证无效");
      }
      const bonusQuota = await getUserAiBonusQuota(userId);
      return {
        rewardQuota: Number(existed.rewardValue || getAiAdRewardValue()),
        bonusQuota,
        duplicated: true,
      };
    }

    const dailyLimit = getAiDailyAdRewardLimit();
    const todayCount = await getTodayAiAdRewardCount(userId);
    if (todayCount >= dailyLimit) {
      throw new AiJournalAdRewardDailyLimitExceededError({
        todayAdRewardCount: todayCount,
        todayAdRewardLimit: dailyLimit,
      });
    }

    const rewardQuota = getAiAdRewardValue();
    try {
      await UserAdRewardLog.create({
        userId,
        rewardToken,
        rewardType: "ai_journal_quota",
        rewardValue: rewardQuota,
        adProvider: String(input.adProvider || "").trim(),
        adUnitId: String(input.adUnitId || "").trim(),
        requestId: String(input.requestId || "").trim(),
        status: "success",
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        const bonusQuota = await getUserAiBonusQuota(userId);
        return {
          rewardQuota,
          bonusQuota,
          duplicated: true,
        };
      }
      throw err;
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          userId,
        },
        $inc: {
          aiBonusQuota: rewardQuota,
        },
      },
      { upsert: true, new: true },
    ).lean();

    const bonusQuota = Math.max(0, Number((updatedUser as any)?.aiBonusQuota || 0));

    return {
      rewardQuota,
      bonusQuota,
      duplicated: false,
    };
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
