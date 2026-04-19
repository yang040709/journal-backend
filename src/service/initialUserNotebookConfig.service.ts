import SystemConfig, {
  SYSTEM_CONFIG_INITIAL_NOTEBOOKS_KEY,
  type InitialNotebookTemplate,
} from "../model/SystemConfig";
import { defaultNoteBook } from "../constant/img";

const MAX_TITLE_LEN = 100;
/** 模板行数上限（与创建数量上限一致，便于运营配置） */
export const MAX_INITIAL_NOTEBOOK_TEMPLATES = 20;

function seedTemplates(): InitialNotebookTemplate[] {
  return defaultNoteBook.map((x) => ({
    title: x.title,
    coverImg: x.coverImg,
    enabled: true,
  }));
}

function normalizeTemplates(
  raw: { title?: string; coverImg?: string; enabled?: boolean }[],
): InitialNotebookTemplate[] {
  const out: InitialNotebookTemplate[] = [];
  for (const row of raw) {
    const title = String(row?.title ?? "").trim();
    const coverImg = String(row?.coverImg ?? "").trim();
    const enabled = row?.enabled !== false;
    if (!title && !coverImg) continue;
    out.push({ title, coverImg, enabled });
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
        initialNotebookCount: 0,
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
      doc.initialNotebookCount = 0;
      await doc.save();
    }

    return doc;
  }

  static assertValidInput(templates: InitialNotebookTemplate[]): void {
    if (templates.length < 1) {
      throw new Error("至少配置一条手帐本模板（标题 + 封面 URL）");
    }
    if (templates.length > MAX_INITIAL_NOTEBOOK_TEMPLATES) {
      throw new Error(`模板行数最多 ${MAX_INITIAL_NOTEBOOK_TEMPLATES} 条`);
    }
    if (templates.every((r) => r.enabled === false)) {
      throw new Error("至少启用一条手帐本模板");
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

  /** 供新用户创建手帐本使用（含种子逻辑）。 */
  static async resolveTemplatesForNewUser(): Promise<InitialNotebookTemplate[]> {
    const doc = await InitialUserNotebookConfigService.ensureSeededDoc();
    const templates = (doc.initialNotebookTemplates || []).map((r) => ({
      title: String(r.title || "").trim(),
      coverImg: String(r.coverImg || "").trim(),
      enabled: r.enabled !== false,
    }));
    return templates
      .filter((t) => t.enabled !== false)
      .slice(0, MAX_INITIAL_NOTEBOOK_TEMPLATES)
      .map((t) => ({ title: t.title, coverImg: t.coverImg, enabled: true }));
  }

  /** 运营报表：排除「系统默认本」标题集合（取当前模板中的 title，去重）。 */
  static async getExcludedNotebookTitles(): Promise<Set<string>> {
    const doc = await InitialUserNotebookConfigService.ensureSeededDoc();
    const set = new Set<string>();
    for (const r of doc.initialNotebookTemplates || []) {
      if (r.enabled === false) continue;
      const s = String(r.title || "").trim();
      if (s) set.add(s);
    }
    return set;
  }

  static async getForAdmin(): Promise<{
    templates: InitialNotebookTemplate[];
    updatedAt: string | null;
  }> {
    const doc = await InitialUserNotebookConfigService.ensureSeededDoc();
    const templates = (doc.initialNotebookTemplates || []).map((r) => ({
      title: String(r.title || ""),
      coverImg: String(r.coverImg || ""),
      enabled: r.enabled !== false,
    }));
    return {
      templates,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
  }

  static async setForAdmin(input: {
    templates: { title?: string; coverImg?: string; enabled?: boolean }[];
  }): Promise<{
    templates: InitialNotebookTemplate[];
    updatedAt: Date;
  }> {
    const templates = normalizeTemplates(input.templates);
    InitialUserNotebookConfigService.assertValidInput(templates);

    const doc = await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_INITIAL_NOTEBOOKS_KEY },
      {
        $set: {
          initialNotebookTemplates: templates,
          initialNotebookCount: 0,
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
        enabled: r.enabled !== false,
      })),
      updatedAt: doc.updatedAt!,
    };
  }
}
