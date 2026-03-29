import SystemConfig, {
  SYSTEM_CONFIG_INITIAL_NOTEBOOKS_KEY,
  type InitialNotebookTemplate,
} from "../model/SystemConfig";
import { defaultNoteBook } from "../constant/img";

const MAX_TITLE_LEN = 100;
/** 模板行数上限（与创建数量上限一致，便于运营配置） */
export const MAX_INITIAL_NOTEBOOK_TEMPLATES = 20;
export const MAX_INITIAL_NOTEBOOK_COUNT = 20;

function seedTemplates(): InitialNotebookTemplate[] {
  return defaultNoteBook.map((x) => ({
    title: x.title,
    coverImg: x.coverImg,
  }));
}

function normalizeTemplates(
  raw: { title?: string; coverImg?: string }[],
): InitialNotebookTemplate[] {
  const out: InitialNotebookTemplate[] = [];
  for (const row of raw) {
    const title = String(row?.title ?? "").trim();
    const coverImg = String(row?.coverImg ?? "").trim();
    if (!title && !coverImg) continue;
    out.push({ title, coverImg });
  }
  return out;
}

export class InitialUserNotebookConfigService {
  /**
   * 确保库中存在配置文档；无文档或模板为空时用代码种子写入（与现网默认一致）。
   */
  static async ensureSeededDoc() {
    let doc = await SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_INITIAL_NOTEBOOKS_KEY,
    });
    const seed = seedTemplates();

    if (!doc) {
      await SystemConfig.create({
        configKey: SYSTEM_CONFIG_INITIAL_NOTEBOOKS_KEY,
        coverUrls: [],
        tagNames: [],
        initialNotebookTemplates: seed,
        initialNotebookCount: seed.length,
      });
      doc = await SystemConfig.findOne({
        configKey: SYSTEM_CONFIG_INITIAL_NOTEBOOKS_KEY,
      });
      if (!doc) {
        throw new Error("初始化新用户手帐本配置失败");
      }
      return doc;
    }

    if (!doc.initialNotebookTemplates?.length) {
      doc.initialNotebookTemplates = seed;
      doc.initialNotebookCount = seed.length;
      await doc.save();
    }

    return doc;
  }

  static assertValidInput(templates: InitialNotebookTemplate[], count: number): void {
    if (templates.length < 1) {
      throw new Error("至少配置一条手帐本模板（标题 + 封面 URL）");
    }
    if (templates.length > MAX_INITIAL_NOTEBOOK_TEMPLATES) {
      throw new Error(`模板行数最多 ${MAX_INITIAL_NOTEBOOK_TEMPLATES} 条`);
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_INITIAL_NOTEBOOK_COUNT) {
      throw new Error(`创建数量须为 1～${MAX_INITIAL_NOTEBOOK_COUNT} 的整数`);
    }
    for (const row of templates) {
      const title = row.title.trim();
      if (!title) {
        throw new Error("每条模板的标题不能为空");
      }
      if (title.length > MAX_TITLE_LEN) {
        throw new Error(`手帐本标题不能超过 ${MAX_TITLE_LEN} 个字符`);
      }
      const url = row.coverImg.trim();
      if (!/^https?:\/\//i.test(url)) {
        throw new Error(`封面须为 http(s) URL：${url || "(空)"}`);
      }
    }
  }

  /**
   * 展开为实际要插入的手帐本列表：对 i=0..count-1 取 templates[i % templates.length]。
   */
  static expandTemplates(
    templates: InitialNotebookTemplate[],
    count: number,
  ): InitialNotebookTemplate[] {
    const t = templates.map((r) => ({
      title: r.title.trim(),
      coverImg: r.coverImg.trim(),
    }));
    const out: InitialNotebookTemplate[] = [];
    for (let i = 0; i < count; i++) {
      out.push({ ...t[i % t.length] });
    }
    return out;
  }

  /** 供新用户创建手帐本使用（含种子逻辑）。 */
  static async resolveTemplatesForNewUser(): Promise<InitialNotebookTemplate[]> {
    const doc = await InitialUserNotebookConfigService.ensureSeededDoc();
    const templates = (doc.initialNotebookTemplates || []).map((r) => ({
      title: String(r.title || "").trim(),
      coverImg: String(r.coverImg || "").trim(),
    }));
    let count = doc.initialNotebookCount;
    if (!Number.isInteger(count) || count < 1) {
      count = templates.length;
    }
    count = Math.min(Math.max(count, 1), MAX_INITIAL_NOTEBOOK_COUNT);
    return InitialUserNotebookConfigService.expandTemplates(templates, count);
  }

  /** 运营报表：排除「系统默认本」标题集合（取当前模板中的 title，去重）。 */
  static async getExcludedNotebookTitles(): Promise<Set<string>> {
    const doc = await InitialUserNotebookConfigService.ensureSeededDoc();
    const set = new Set<string>();
    for (const r of doc.initialNotebookTemplates || []) {
      const s = String(r.title || "").trim();
      if (s) set.add(s);
    }
    return set;
  }

  static async getForAdmin(): Promise<{
    templates: InitialNotebookTemplate[];
    count: number;
    updatedAt: string | null;
  }> {
    const doc = await InitialUserNotebookConfigService.ensureSeededDoc();
    const templates = (doc.initialNotebookTemplates || []).map((r) => ({
      title: String(r.title || ""),
      coverImg: String(r.coverImg || ""),
    }));
    let count = doc.initialNotebookCount;
    if (!Number.isInteger(count) || count < 1) {
      count = templates.length;
    }
    return {
      templates,
      count,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
  }

  static async setForAdmin(input: {
    templates: { title?: string; coverImg?: string }[];
    count: number;
  }): Promise<{
    templates: InitialNotebookTemplate[];
    count: number;
    updatedAt: Date;
  }> {
    const templates = normalizeTemplates(input.templates);
    InitialUserNotebookConfigService.assertValidInput(templates, input.count);

    const doc = await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_INITIAL_NOTEBOOKS_KEY },
      {
        $set: {
          initialNotebookTemplates: templates,
          initialNotebookCount: input.count,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    if (!doc) {
      throw new Error("保存新用户手帐本配置失败");
    }

    return {
      templates: (doc.initialNotebookTemplates || []).map((r) => ({
        title: String(r.title || ""),
        coverImg: String(r.coverImg || ""),
      })),
      count: doc.initialNotebookCount,
      updatedAt: doc.updatedAt!,
    };
  }
}
