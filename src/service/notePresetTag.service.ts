import SystemConfig, {
  SYSTEM_CONFIG_NOTE_PRESET_TAGS_KEY,
} from "../model/SystemConfig";
import { NOTE_PRESET_TAGS_SEED } from "../constant/notePresetTagsSeed";

const MAX_TAG_LENGTH = 20;
const MAX_TAG_COUNT = 100;

function normalizeInput(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    if (s.length > MAX_TAG_LENGTH) {
      throw new Error(`单个标签不能超过 ${MAX_TAG_LENGTH} 个字符：${s.slice(0, 30)}…`);
    }
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export class NotePresetTagService {
  static assertValidTagList(tagNames: string[]): void {
    const normalized = normalizeInput(tagNames);
    if (normalized.length < 1) {
      throw new Error("至少保留一个预设标签");
    }
    if (normalized.length > MAX_TAG_COUNT) {
      throw new Error(`预设标签最多 ${MAX_TAG_COUNT} 个`);
    }
  }

  /**
   * 过滤为用户可保存的标签（保留用户顺序，仅保留白名单内）
   */
  static filterToPreset(tags: string[], allowed: readonly string[]): string[] {
    const allow = new Set(allowed);
    const out: string[] = [];
    for (const t of tags) {
      const s = String(t ?? "").trim();
      if (s && allow.has(s) && !out.includes(s)) {
        out.push(s);
      }
    }
    return out;
  }

  static async getTagNames(): Promise<string[]> {
    let doc = await SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_NOTE_PRESET_TAGS_KEY,
    });
    if (!doc) {
      await SystemConfig.create({
        configKey: SYSTEM_CONFIG_NOTE_PRESET_TAGS_KEY,
        coverUrls: [],
        tagNames: [...NOTE_PRESET_TAGS_SEED],
      });
      doc = await SystemConfig.findOne({
        configKey: SYSTEM_CONFIG_NOTE_PRESET_TAGS_KEY,
      });
    }
    const names = doc?.tagNames?.length ? [...doc.tagNames] : [];
    if (names.length === 0) {
      const fallback = [...NOTE_PRESET_TAGS_SEED];
      if (doc) {
        doc.tagNames = fallback;
        await doc.save();
      }
      return fallback;
    }
    return names;
  }

  /** 管理端：含更新时间（与 system_covers 返回风格一致） */
  static async getForAdmin(): Promise<{ tags: string[]; updatedAt: string | null }> {
    const tags = await NotePresetTagService.getTagNames();
    const doc = await SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_NOTE_PRESET_TAGS_KEY,
    }).lean();
    return {
      tags,
      updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
  }

  static async setTagNames(raw: string[]): Promise<{
    tags: string[];
    updatedAt: Date;
  }> {
    const normalized = normalizeInput(raw);
    NotePresetTagService.assertValidTagList(normalized);

    const doc = await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_NOTE_PRESET_TAGS_KEY },
      {
        $set: {
          tagNames: normalized,
          coverUrls: [],
        },
        $setOnInsert: {
          configKey: SYSTEM_CONFIG_NOTE_PRESET_TAGS_KEY,
        },
      },
      { new: true, upsert: true },
    );

    if (!doc) {
      throw new Error("保存预设标签失败");
    }

    return {
      tags: [...doc.tagNames],
      updatedAt: doc.updatedAt!,
    };
  }
}
