import User from "../model/User";
import { NotePresetTagService } from "./notePresetTag.service";

/** 与 notePresetTag.service 中单标签长度一致 */
const MAX_TAG_LENGTH = 20;
export const MAX_CUSTOM_NOTE_TAGS = 12;

function normalizeOne(raw: unknown): string {
  return String(raw ?? "").trim();
}

export class UserNoteCustomTagService {
  /**
   * 系统标签在前，自定义标签在后（与系统同名的自定义项在 add 时已禁止）
   */
  static mergeSelectableTags(
    systemTags: readonly string[],
    customTags: readonly string[],
  ): string[] {
    const sysSet = new Set(systemTags);
    const out: string[] = [...systemTags];
    for (const c of customTags) {
      if (c && !sysSet.has(c) && !out.includes(c)) {
        out.push(c);
      }
    }
    return out;
  }

  static async list(userId: string): Promise<string[]> {
    const user = await User.findOne({ userId }).select("customNoteTags").lean();
    const arr = user?.customNoteTags;
    return Array.isArray(arr) ? [...arr] : [];
  }

  /** 创建/更新手帐时与系统预设合并为白名单 */
  static async getAllowedTagNames(userId: string): Promise<string[]> {
    const [systemTags, customTags] = await Promise.all([
      NotePresetTagService.getTagNames(),
      UserNoteCustomTagService.list(userId),
    ]);
    return UserNoteCustomTagService.mergeSelectableTags(systemTags, customTags);
  }

  static async add(userId: string, rawName: unknown): Promise<string[]> {
    const name = normalizeOne(rawName);
    if (!name) {
      throw new Error("标签名称不能为空");
    }
    if (name.length > MAX_TAG_LENGTH) {
      throw new Error(`单个标签不能超过 ${MAX_TAG_LENGTH} 个字符`);
    }

    const preset = await NotePresetTagService.getTagNames();
    if (preset.includes(name)) {
      throw new Error("不能与系统标签同名");
    }

    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error("用户不存在");
    }

    const current = [...(user.customNoteTags || [])];
    if (current.includes(name)) {
      throw new Error("该标签已存在");
    }
    if (current.length >= MAX_CUSTOM_NOTE_TAGS) {
      throw new Error(`自定义标签最多 ${MAX_CUSTOM_NOTE_TAGS} 个`);
    }

    current.push(name);
    user.customNoteTags = current;
    await user.save();
    return current;
  }

  static async remove(userId: string, rawName: unknown): Promise<string[]> {
    const name = normalizeOne(rawName);
    if (!name) {
      throw new Error("标签名称不能为空");
    }

    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error("用户不存在");
    }

    const current = [...(user.customNoteTags || [])];
    const next = current.filter((t) => t !== name);
    if (next.length === current.length) {
      throw new Error("未找到该标签");
    }
    user.customNoteTags = next;
    await user.save();
    return next;
  }
}
