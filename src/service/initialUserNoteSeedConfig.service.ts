import SystemConfig, {
  SYSTEM_CONFIG_INITIAL_NOTES_KEY,
  type InitialNoteTemplate,
} from "../model/SystemConfig";

const MAX_TITLE_LEN = 200;
const MAX_CONTENT_LEN = 20_000;
/** 模板行数上限（与手帐本上限一致，便于运营配置） */
export const MAX_INITIAL_NOTE_TEMPLATES = 40;
export const MAX_INITIAL_NOTE_TARGET_INDEX = 19;

function seedTemplates(): InitialNoteTemplate[] {
  return [
    {
      seedKey: "seed_note_welcome_treasure_v1",
      targetIndex: 0,
      title: "恭喜你发现宝藏！",
      content: [
        "嗨，很高兴在这里遇见你！",
        "",
        "这里是你的专属「生活碎碎念」空间。",
        "无论是今天吃到的一顿惊艳美食、看电影时偷偷掉的眼泪，还是走在路上突然蹦出来的怪想法，都可以毫无压力地写在这里。",
        "",
        "💡 热身小贴士：",
        "试着点击下面的“编辑”按钮，把这段话删掉，写下你今天的第一句碎碎念吧！",
        "如果不喜欢这个本子的名字，可以回到首页点击手帐本右下角的小齿轮就能重新命名。",
      ].join("\n"),
      tags: [],
      isPinned: false,
    },
    {
      seedKey: "seed_note_guide_v1",
      targetIndex: 0,
      title: "玩转手帐使用指南",
      content: [
        "欢迎来到手帐小程序！为了让你更快上手、记录更顺滑，请收下这份超简单指南。先记住两个概念：手帐本用来分类管理（比如「旅行日记」「学习笔记」「灵感收集」）；手帐是手帐本里的每一篇记录，文字/图片都可以，装下你的生活碎片。",
        "",
        "接下来用最短路径带你认识主要页面，并顺便把常用玩法串起来：",
        "",
        "1）手帐首页（Tab：手帐）",
        "上方是手帐本卡片，滑到最后一张「+」即可新建手帐本；下方「近期手帐」会展示你最近新增/编辑的记录，回顾特别方便。",
        "",
        "2）手帐本（进入某个手帐本）",
        "这里是某一本的内容列表，适合按主题持续记录。进入后点击页面右下角按钮即可新建手帐，写完会自动出现在「近期手帐」。",
        "",
        "3）浏览全部手帐",
        "当手帐变多时，用它按手帐本、日期、标签筛选，快速定位到某条记录。",
        "",
        "4）日历视图",
        "用热力图回顾“这个月记录得有多勤”，点日期格子即可查看当天的手帐列表。",
        "",
        "5）废纸篓",
        "删除不会立刻消失：你可以在这里恢复误删内容，或选择彻底删除。",
        "",
        "6）内容管理（模板 / 图片 / 标签 / 手帐本封面）",
        "模板：把常用结构存起来，下次一键套用；图片：查看上传过的手帐图片与封面；标签：建立自己的分类体系，后续检索更快；封面：统一管理手帐本封面，让主页更好看。",
        "",
        "7）数据（统计分析）",
        "在「统计分析」里看看你的创作趋势和记录节奏。",
        "",
        "8）我的页面（Tab：我的）",
        "所有入口都在这里汇总：浏览整理、内容管理、数据与账户，以及设置、反馈与建议、推荐应用、关于等。",
        "",
      ].join("\n"),
      tags: [],
      isPinned: false,
    },
    {
      seedKey: "seed_note_memo_hint_v1",
      targetIndex: 1,
      title: "💡 这里可以记点什么？",
      content: [
        "这是一个纯粹、高效的备忘空间，专门用来对付那些“转头就忘”的生活琐事。",
        "",
        "你可以把这里当成你的临时大脑，随手记下：",
        "",
        "🛒 【待办与清单】",
        "- 下班去超市要买的食材",
        "- 朋友安利但还没时间看的电影",
        "- 今年计划读完的书单",
        "",
        "🔑 【临时备忘】",
        "- 丰巢取件码：12345",
        "- 聚会餐厅地址",
        "- 晚上要看的电视剧",
        "",
        "随手记下，办完在标题写一个已完成（或删掉或移到别的手帐本）。让大脑轻松一点，把精力留给更美好的事情吧！",
      ].join("\n"),
      tags: [],
      isPinned: false,
    },
  ];
}

function normalizeTemplates(
  raw: Partial<InitialNoteTemplate>[],
): InitialNoteTemplate[] {
  const out: InitialNoteTemplate[] = [];
  for (const row of raw || []) {
    const seedKey = String(row?.seedKey ?? "").trim();
    const title = String(row?.title ?? "").trim();
    const content = String(row?.content ?? "");
    const targetIndex = Number(row?.targetIndex ?? 0);
    const tags = Array.isArray(row?.tags)
      ? row!.tags!.map((t) => String(t ?? "").trim()).filter(Boolean)
      : [];
    const isPinned = Boolean(row?.isPinned);

    if (!seedKey && !title && !content) continue;
    out.push({ seedKey, title, content, targetIndex, tags, isPinned });
  }
  return out;
}

export class InitialUserNoteSeedConfigService {
  static async ensureSeededDoc() {
    let doc = await SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_INITIAL_NOTES_KEY,
    });
    const seed = seedTemplates();

    if (!doc) {
      await SystemConfig.create({
        configKey: SYSTEM_CONFIG_INITIAL_NOTES_KEY,
        coverUrls: [],
        tagNames: [],
        initialNotebookTemplates: [],
        initialNotebookCount: 0,
        initialNoteTemplates: seed,
      });
      doc = await SystemConfig.findOne({
        configKey: SYSTEM_CONFIG_INITIAL_NOTES_KEY,
      });
      if (!doc) {
        throw new Error("初始化新用户初始手帐配置失败");
      }
      return doc;
    }

    if (!doc.initialNoteTemplates?.length) {
      doc.initialNoteTemplates = seed;
      await doc.save();
    }

    return doc;
  }

  static assertValidInput(templates: InitialNoteTemplate[]): void {
    if (templates.length > MAX_INITIAL_NOTE_TEMPLATES) {
      throw new Error(`模板行数最多 ${MAX_INITIAL_NOTE_TEMPLATES} 条`);
    }

    const seedKeySet = new Set<string>();
    for (const row of templates) {
      const seedKey = String(row.seedKey || "").trim();
      if (!seedKey) {
        throw new Error("每条模板的 seedKey 不能为空");
      }
      if (seedKey.length > 120) {
        throw new Error("seedKey 不能超过 120 个字符");
      }
      if (seedKeySet.has(seedKey)) {
        throw new Error(`seedKey 重复：${seedKey}`);
      }
      seedKeySet.add(seedKey);

      const idx = Number(row.targetIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx > MAX_INITIAL_NOTE_TARGET_INDEX) {
        throw new Error(
          `targetIndex 须为 0～${MAX_INITIAL_NOTE_TARGET_INDEX} 的整数`,
        );
      }

      const title = String(row.title || "").trim();
      if (!title) {
        throw new Error("每条模板的标题不能为空");
      }
      if (title.length > MAX_TITLE_LEN) {
        throw new Error(`手帐标题不能超过 ${MAX_TITLE_LEN} 个字符`);
      }

      const content = String(row.content || "");
      if (content.length > MAX_CONTENT_LEN) {
        throw new Error(`手帐正文不能超过 ${MAX_CONTENT_LEN} 个字符`);
      }

      if (row.tags && !Array.isArray(row.tags)) {
        throw new Error("tags 格式错误");
      }
      if (Array.isArray(row.tags) && row.tags.length > 100) {
        throw new Error("tags 最多 100 个");
      }
    }
  }

  static async resolveTemplatesForNewUser(): Promise<InitialNoteTemplate[]> {
    const doc = await InitialUserNoteSeedConfigService.ensureSeededDoc();
    const templates = (doc.initialNoteTemplates || []).map((r) => ({
      seedKey: String(r.seedKey || "").trim(),
      targetIndex: Number(r.targetIndex ?? 0),
      title: String(r.title || "").trim(),
      content: String(r.content || ""),
      tags: Array.isArray(r.tags) ? r.tags.map((t) => String(t || "").trim()).filter(Boolean) : [],
      isPinned: Boolean(r.isPinned),
    }));
    return templates.filter((t) => t.seedKey && t.title);
  }

  static async getForAdmin(): Promise<{
    templates: InitialNoteTemplate[];
    updatedAt: string | null;
  }> {
    const doc = await InitialUserNoteSeedConfigService.ensureSeededDoc();
    const templates = (doc.initialNoteTemplates || []).map((r) => ({
      seedKey: String(r.seedKey || ""),
      targetIndex: Number(r.targetIndex ?? 0),
      title: String(r.title || ""),
      content: String(r.content || ""),
      tags: Array.isArray(r.tags) ? r.tags.map((t) => String(t || "")) : [],
      isPinned: Boolean(r.isPinned),
    }));
    return {
      templates,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
  }

  static async setForAdmin(input: {
    templates: Partial<InitialNoteTemplate>[];
  }): Promise<{
    templates: InitialNoteTemplate[];
    updatedAt: Date;
  }> {
    const templates = normalizeTemplates(input.templates || []);
    InitialUserNoteSeedConfigService.assertValidInput(templates);

    const doc = await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_INITIAL_NOTES_KEY },
      {
        $set: {
          initialNoteTemplates: templates,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    if (!doc) {
      throw new Error("保存新用户初始手帐配置失败");
    }

    return {
      templates: (doc.initialNoteTemplates || []).map((r) => ({
        seedKey: String(r.seedKey || ""),
        targetIndex: Number(r.targetIndex ?? 0),
        title: String(r.title || ""),
        content: String(r.content || ""),
        tags: Array.isArray(r.tags) ? r.tags.map((t) => String(t || "")) : [],
        isPinned: Boolean(r.isPinned),
      })),
      updatedAt: doc.updatedAt!,
    };
  }
}

