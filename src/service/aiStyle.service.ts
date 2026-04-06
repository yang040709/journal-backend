import AiStyle, { IAiStyle, AiNoteMode } from "../model/AiStyle";
import {
  AI_STYLE_PLACEHOLDERS,
  AI_STYLE_SEED,
  AI_STYLE_SHARED_USER_PROMPT_TEMPLATE,
} from "../constant/aiStyleSeed";

type ClientStyleItem = {
  styleKey: string;
  name: string;
  subtitle: string;
  category: string;
  order: number;
  isDefault: boolean;
  isRecommended: boolean;
  version: number;
  updatedAt: string;
};

type PromptBuildInput = {
  mode: AiNoteMode;
  title?: string;
  content?: string;
  tags?: string[];
  hint?: string;
  today: string;
};

type StyleDocForClient = Pick<
  IAiStyle,
  | "styleKey"
  | "name"
  | "subtitle"
  | "category"
  | "order"
  | "isDefault"
  | "isRecommended"
  | "version"
> & { updatedAt: Date };

const PLACEHOLDER_REG = /\{\{(\w+)\}\}/g;

function normalizeTrim(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeCategory(v: unknown): IAiStyle["category"] {
  const s = normalizeTrim(v || "diary");
  if (s === "diary" || s === "structured" || s === "social") return s;
  return "diary";
}

function sanitizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    const s = normalizeTrim(t);
    if (!s || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

function normalizeForStorage(payload: Partial<IAiStyle>) {
  return {
    styleKey: normalizeTrim(payload.styleKey),
    name: normalizeTrim(payload.name),
    subtitle: normalizeTrim(payload.subtitle),
    description: normalizeTrim(payload.description),
    category: normalizeTrim(payload.category || "diary"),
    order: Number.isFinite(payload.order) ? Number(payload.order) : 100,
    enabled: payload.enabled !== false,
    isDefault: payload.isDefault === true,
    isRecommended: payload.isRecommended === true,
    version: Number.isFinite(payload.version) ? Number(payload.version) : 1,
    systemPrompt: String(payload.systemPrompt || "").trim(),
    userPromptTemplate: String(payload.userPromptTemplate || "").trim(),
    modePrompts: payload.modePrompts || {},
    maxOutputChars:
      typeof payload.maxOutputChars === "number" ? payload.maxOutputChars : undefined,
    emojiPolicy:
      payload.emojiPolicy === "forbid" ||
      payload.emojiPolicy === "low" ||
      payload.emojiPolicy === "normal"
        ? payload.emojiPolicy
        : undefined,
    outputFormat: normalizeTrim(payload.outputFormat),
    updatedBy: normalizeTrim(payload.updatedBy),
  };
}

function validatePromptTemplatePlaceholders(template: string): void {
  const unknown = new Set<string>();
  let m: RegExpExecArray | null = null;
  while ((m = PLACEHOLDER_REG.exec(template))) {
    const key = m[1];
    if (!AI_STYLE_PLACEHOLDERS.includes(key as (typeof AI_STYLE_PLACEHOLDERS)[number])) {
      unknown.add(key);
    }
  }
  if (unknown.size > 0) {
    throw new Error(`存在未知占位符: ${Array.from(unknown).join(", ")}`);
  }
}

function formatForClient(doc: StyleDocForClient): ClientStyleItem {
  return {
    styleKey: doc.styleKey,
    name: doc.name,
    subtitle: doc.subtitle || "",
    category: doc.category,
    order: doc.order,
    isDefault: !!doc.isDefault,
    isRecommended: !!doc.isRecommended,
    version: doc.version || 1,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class AiStyleService {
  static async ensureSeed(): Promise<void> {
    for (const item of AI_STYLE_SEED) {
      await AiStyle.updateOne(
        { styleKey: item.styleKey },
        {
          $setOnInsert: {
            ...item,
            userPromptTemplate: item.userPromptTemplate || AI_STYLE_SHARED_USER_PROMPT_TEMPLATE,
            version: 1,
          },
        },
        { upsert: true },
      );
    }
    const defaultStyle = await AiStyle.findOne({ isDefault: true });
    if (!defaultStyle) {
      await AiStyle.updateOne({ styleKey: "journal_default" }, { $set: { isDefault: true } });
    }
  }

  static async listEnabledForClient(): Promise<{
    items: ClientStyleItem[];
    version: number;
    updatedAt: string | null;
  }> {
    const rows = await AiStyle.find({ enabled: true })
      .sort({ isDefault: -1, order: 1, updatedAt: -1 })
      .lean();
    const items = rows.map((r) =>
      formatForClient({
        styleKey: String(r.styleKey || ""),
        name: String(r.name || ""),
        subtitle: String(r.subtitle || ""),
        category: normalizeCategory(r.category),
        order: Number(r.order || 0),
        isDefault: !!r.isDefault,
        isRecommended: !!r.isRecommended,
        version: Number(r.version || 1),
        updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(0),
      }),
    );
    const latest = rows[0]?.updatedAt ? new Date(rows[0].updatedAt) : null;
    const maxVersion = rows.reduce((max, item) => Math.max(max, Number(item.version || 1)), 1);
    return { items, version: maxVersion, updatedAt: latest ? latest.toISOString() : null };
  }

  static async listForAdmin(): Promise<IAiStyle[]> {
    return AiStyle.find({}).sort({ order: 1, updatedAt: -1 });
  }

  static async getByIdForAdmin(id: string): Promise<IAiStyle | null> {
    return AiStyle.findById(id);
  }

  static async createForAdmin(payload: Partial<IAiStyle>): Promise<IAiStyle> {
    const data = normalizeForStorage(payload);
    if (!data.styleKey) throw new Error("styleKey 不能为空");
    if (!data.name) throw new Error("name 不能为空");
    if (!data.systemPrompt) throw new Error("systemPrompt 不能为空");
    if (!data.userPromptTemplate) throw new Error("userPromptTemplate 不能为空");
    validatePromptTemplatePlaceholders(data.userPromptTemplate);
    if (data.isDefault) {
      await AiStyle.updateMany({ isDefault: true }, { $set: { isDefault: false } });
    }
    const created = await AiStyle.create({
      ...data,
      version: Math.max(1, data.version || 1),
    });
    return created;
  }

  static async updateForAdmin(id: string, payload: Partial<IAiStyle>): Promise<IAiStyle | null> {
    const prev = await AiStyle.findById(id);
    if (!prev) return null;
    const patch = normalizeForStorage({
      ...prev.toObject(),
      ...payload,
      version: (prev.version || 1) + 1,
    });
    if (!patch.styleKey) throw new Error("styleKey 不能为空");
    if (!patch.name) throw new Error("name 不能为空");
    if (!patch.systemPrompt) throw new Error("systemPrompt 不能为空");
    if (!patch.userPromptTemplate) throw new Error("userPromptTemplate 不能为空");
    validatePromptTemplatePlaceholders(patch.userPromptTemplate);
    if (patch.isDefault) {
      await AiStyle.updateMany({ _id: { $ne: id }, isDefault: true }, { $set: { isDefault: false } });
    }
    return AiStyle.findByIdAndUpdate(id, { $set: patch }, { new: true });
  }

  static async setEnabled(id: string, enabled: boolean): Promise<IAiStyle | null> {
    const updated = await AiStyle.findByIdAndUpdate(
      id,
      { $set: { enabled, version: Date.now() } },
      { new: true },
    );
    if (!updated) return null;
    if (!enabled && updated.isDefault) {
      const fallback = await AiStyle.findOne({ _id: { $ne: id }, enabled: true }).sort({
        order: 1,
      });
      if (fallback) {
        fallback.isDefault = true;
        await fallback.save();
      }
      updated.isDefault = false;
      await updated.save();
    }
    return updated;
  }

  static async setDefault(id: string): Promise<IAiStyle | null> {
    const target = await AiStyle.findById(id);
    if (!target) return null;
    if (!target.enabled) throw new Error("默认风格必须为启用状态");
    await AiStyle.updateMany({ isDefault: true }, { $set: { isDefault: false } });
    target.isDefault = true;
    target.version = (target.version || 1) + 1;
    await target.save();
    return target;
  }

  static async resolveActiveStyle(styleKey?: string): Promise<IAiStyle> {
    const key = normalizeTrim(styleKey);
    if (key) {
      const matched = await AiStyle.findOne({ styleKey: key, enabled: true });
      if (matched) return matched;
    }
    const def = await AiStyle.findOne({ enabled: true, isDefault: true }).sort({ order: 1 });
    if (def) return def;
    const first = await AiStyle.findOne({ enabled: true }).sort({ order: 1 });
    if (first) return first;
    throw new Error("未配置可用 AI 风格");
  }

  static buildPrompt(style: IAiStyle, input: PromptBuildInput): { systemPrompt: string; userPrompt: string } {
    const modePrompt = style.modePrompts?.[input.mode] || "";
    const safeTitle = normalizeTrim(input.title);
    const safeContent = String(input.content || "").trim();
    const safeTags = sanitizeTags(input.tags).join("、") || "无";
    const safeHint = normalizeTrim(input.hint) || "无";
    const template = style.userPromptTemplate || AI_STYLE_SHARED_USER_PROMPT_TEMPLATE;
    validatePromptTemplatePlaceholders(template);
    const map: Record<string, string> = {
      mode: input.mode,
      today: input.today,
      title: safeTitle || "无",
      content: safeContent || "无",
      tags: safeTags,
      hint: safeHint,
    };
    const userPrompt = template.replace(PLACEHOLDER_REG, (_, key: string) => map[key] || "");
    const fullSystemPrompt = [style.systemPrompt, modePrompt].filter(Boolean).join("\n\n");
    return { systemPrompt: fullSystemPrompt, userPrompt };
  }
}
