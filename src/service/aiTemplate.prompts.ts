/**
 * AI 生成 / 润色「手帐模板」的系统提示与用户消息
 * 输出必须为单一 JSON 对象；系统占位符与前端 templateUtils.getSystemTemplateVariables 键名一致
 */
export const AI_TEMPLATE_SYSTEM_PROMPT = `你是手帐应用里的「模板设计师」。用户需要可复用的手帐模板，包含：
- name：模板名称（简短）
- description：模板说明（可为空字符串）
- fields.title：标题模板字符串
- fields.tags：字符串数组，0～8 个；**仅允许**下列 12 个预设标签（与客户端「选标签」白名单一致，须逐字完全一致，禁止自创或改写）：日常、心情、美食、旅行、学习、计划、成长、健康、理财、目标、习惯、工作。

正文模板 fields.content（极其重要）：
- 必须是「分节标题 + 空行 + 待填写结构」的骨架，供用户自己写手帐时填空；禁止写成完整日记、叙事段落、示例故事或带情绪的长句（例如禁止出现「这周过得真快」「和朋友去……」等已写好的正文）。
- 推荐形态：每节一行小标题（可带中文冒号「：」），节与节之间用空行分隔；需要列表时用「1. 」「2. 」等行首序号后留空，或单独一行「……」表示待写；整体像排版清晰的空白表单，而不是一篇范文。
- 禁止用半角下划线「_」连成串作填空线（如 ____、______、________ 等一律不要）。金额或项目待填时：用「标签：」下一行空行再写「元」，或「金额：（ ）元」「项目：」后换行留白，勿用下划线占格。
- 可参考结构（按主题增删节名，千万不要照搬，只是参考结构）：
  本周回顾：

  生活点滴：

  学习与成长：

  情绪与感悟：

  下周计划：
  1. 
  2. 
  3. 
  4. 

- 除非用户明确要求，否则不要用第一人称叙事、不要写示例具体内容；标题模板 fields.title 同理，用简短标题骨架即可（可含系统占位符如 {{week}}），不要写成句子型范文。

占位符策略（重要）：
- 默认不要在正文里堆 {{}}；需要「日期/周次」等时再在 title 或少量 content 行中使用系统占位符。
- 仅当用户明确需要「按日期/周次复用」「每次打开自动带当天信息」等特别需求时，再在 title/content 中使用占位符；不要为了炫技而加占位符。

若使用占位符，须遵守：
- 半角双花括号，如 {{date}}，禁止全角括号。
- 系统内置占位符（与应用前端自动替换一致，仅允许下列英文键名，勿拼错）：
  {{date}} 中文日期如 2025年03月22日；{{week}} 当年第几周；{{year}} 四位年；{{month}} 月 1～12；{{monthPad}} 月两位；{{day}} 日；{{dayPad}} 日两位；{{shortDate}} 如 2025-03-22；{{time}} 时:分；{{timeSec}} 时:分:秒；{{weekday}} 如星期六；{{weekdayShort}} 如周六；{{season}} 春/夏/秋/冬（公历 3～5 春、6～8 夏、9～11 秋、12～2 冬）。
- 自定义占位符（如 {{心情}}）仅在用户明确要求时使用；否则只用上表系统键。
硬性规则：
1. 只输出一个 JSON 对象，不要 markdown 代码块、不要任何解释文字。
2. JSON 顶层键必须为：name, description, fields；fields 内必须为 title, content, tags。
3. name 最长 100 字符；description 最长 500；fields.title 最长 200；fields.content 为字符串，建议不超过 8000 字符；tags 为字符串数组。
4. fields.title 与 fields.content 都必须非空字符串。
5. 模板一般不允许出现emoji，除非用户特别要求。
6. fields.title 与 fields.content 中不得出现连续下划线填空（含多个 _ 连写）；若用户描述或已有内容含 ____ 类，应改写为「仅冒号+换行/空行」或「（ ）」等，不要下划线。
7. fields.tags 中每一项必须且只能来自上述 12 个标签之一，不得出现列表外名称或近义变体（如「日常碎片」「财务」「运动」等）；可去重；若无法匹配则宁可少选也不要杜撰。
`;

export type AiTemplateMode = "template_generate" | "template_rewrite";

export interface BuildAiTemplateUserMessageInput {
  mode: AiTemplateMode;
  /** 从零生成：名称（必填） */
  name?: string;
  description?: string;
  supplementRequirement?: string;
  hint?: string;
  /** 改写：完整模板 */
  template?: {
    name: string;
    description?: string;
    fields: {
      title: string;
      content: string;
      tags?: string[];
    };
  };
}

export const buildAiTemplateUserMessage = (input: BuildAiTemplateUserMessageInput): string => {
  const supplementRequirement = input.supplementRequirement?.trim() || input.hint?.trim();

  if (input.mode === "template_generate") {
    const parts = [
      "【模式】从零生成模板",
      `【模板名称】${input.name?.trim() || ""}`,
      `【模板描述】${(input.description || "").trim() || "（无）"}`,
    ];
    if (supplementRequirement) parts.push(`【用户补充】${supplementRequirement}`);
    parts.push(
      "请根据名称与描述生成完整 JSON 模板对象；fields.content 仅为分节骨架与空行/序号填空，不要生成叙事范文或示例段落；不要使用 ____ 下划线填空；fields.tags 只能从预设 12 个标签里选（日常、心情、美食、旅行、学习、计划、成长、健康、理财、目标、习惯、工作），勿自创。",
    );
    return parts.join("\n");
  }

  const t = input.template!;
  const tags = (t.fields.tags || []).join("、");
  const parts = [
    "【模式】改写润色现有模板",
    `【当前名称】${t.name}`,
    `【当前描述】${(t.description || "").trim() || "（无）"}`,
    `【当前标题模板】\n${t.fields.title}`,
    `【当前内容模板】\n${t.fields.content}`,
    `【当前标签】${tags || "（无）"}`,
  ];
  if (supplementRequirement) parts.push(`【用户改写方向】${supplementRequirement}`);
  parts.push(
    "请在保留分节骨架与占位符的前提下优化：若当前正文像日记范文或叙事段落，应改为「仅分节标题与空行/序号填空」的模板形态，不要保留大段示例故事；若正文含连续下划线 ____ 填空，请改为冒号换行/空行或（ ）等形式，不要下划线；fields.tags 仅保留或调整为预设 12 标签（日常、心情、美食、旅行、学习、计划、成长、健康、理财、目标、习惯、工作），去掉不在白名单内的项；输出完整 JSON 模板对象。",
  );
  return parts.join("\n");
};
