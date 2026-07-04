import { randomUUID } from "crypto";
import SystemConfig, { SYSTEM_CONFIG_FEEDBACK_QUICK_REPLIES_KEY } from "../model/SystemConfig";
import { FEEDBACK_QUICK_REPLIES_SEED, type FeedbackQuickReplyItem } from "../constant/feedbackQuickRepliesSeed";

const MAX_LABEL_LENGTH = 30;
const MAX_CONTENT_LENGTH = 1000;
const MAX_ITEM_COUNT = 50;

function normalizeItem(raw: unknown, index: number): FeedbackQuickReplyItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const label = String(row.label || "").trim();
  const content = String(row.content || "").trim();
  if (!label || !content) return null;
  if (label.length > MAX_LABEL_LENGTH) {
    throw new Error(`快捷回复标题不能超过 ${MAX_LABEL_LENGTH} 个字符`);
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`快捷回复内容不能超过 ${MAX_CONTENT_LENGTH} 个字符`);
  }
  const id = String(row.id || "").trim() || randomUUID();
  return {
    id,
    label,
    content,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index,
    enabled: row.enabled !== false,
  };
}

function normalizeList(raw: unknown): FeedbackQuickReplyItem[] {
  const list = Array.isArray(raw) ? raw : [];
  const normalized: FeedbackQuickReplyItem[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < list.length; i += 1) {
    const item = normalizeItem(list[i], i);
    if (!item) continue;
    if (seenIds.has(item.id)) {
      item.id = randomUUID();
    }
    seenIds.add(item.id);
    normalized.push(item);
  }
  if (normalized.length > MAX_ITEM_COUNT) {
    throw new Error(`快捷回复最多 ${MAX_ITEM_COUNT} 条`);
  }
  return normalized.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "zh-CN"));
}

function serializeItem(item: FeedbackQuickReplyItem) {
  return {
    id: item.id,
    label: item.label,
    content: item.content,
    sortOrder: item.sortOrder,
    enabled: item.enabled,
  };
}

export class FeedbackQuickReplyService {
  private static async ensureDoc() {
    let doc = await SystemConfig.findOne({ configKey: SYSTEM_CONFIG_FEEDBACK_QUICK_REPLIES_KEY });
    if (!doc) {
      await SystemConfig.create({
        configKey: SYSTEM_CONFIG_FEEDBACK_QUICK_REPLIES_KEY,
        coverUrls: [],
        tagNames: [],
        feedbackQuickReplies: FEEDBACK_QUICK_REPLIES_SEED.map((item) => ({ ...item })),
      });
      doc = await SystemConfig.findOne({ configKey: SYSTEM_CONFIG_FEEDBACK_QUICK_REPLIES_KEY });
    }
    if (doc && !Array.isArray(doc.feedbackQuickReplies)) {
      doc.feedbackQuickReplies = FEEDBACK_QUICK_REPLIES_SEED.map((item) => ({ ...item }));
      await doc.save();
    }
    return doc!;
  }

  static async getForAdmin(): Promise<{ items: FeedbackQuickReplyItem[]; updatedAt: string | null }> {
    const doc = await FeedbackQuickReplyService.ensureDoc();
    const items = normalizeList(doc.feedbackQuickReplies);
    return {
      items,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
  }

  static async getEnabled(): Promise<FeedbackQuickReplyItem[]> {
    const { items } = await FeedbackQuickReplyService.getForAdmin();
    return items.filter((item) => item.enabled);
  }

  static async setItems(raw: unknown): Promise<{ items: FeedbackQuickReplyItem[]; updatedAt: string }> {
    const normalized = normalizeList(raw).map((item, index) => ({
      ...item,
      sortOrder: index,
    }));

    const doc = await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_FEEDBACK_QUICK_REPLIES_KEY },
      {
        $set: {
          feedbackQuickReplies: normalized,
          coverUrls: [],
          tagNames: [],
        },
        $setOnInsert: {
          configKey: SYSTEM_CONFIG_FEEDBACK_QUICK_REPLIES_KEY,
        },
      },
      { new: true, upsert: true },
    );

    if (!doc) {
      throw new Error("保存快捷回复失败");
    }

    return {
      items: normalizeList(doc.feedbackQuickReplies),
      updatedAt: new Date(doc.updatedAt!).toISOString(),
    };
  }
}

export { serializeItem as serializeFeedbackQuickReplyItem };
