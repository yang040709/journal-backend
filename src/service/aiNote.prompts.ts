/**
 * AI 写手帐：系统提示与用户消息模板（供 AiNoteService 调用 DeepSeek）
 */

export type AiNotePromptMode = "generate" | "rewrite" | "continue";

export interface AiNotePromptInput {
  mode: AiNotePromptMode;
  title?: string;
  content?: string;
  tags?: string[];
  hint?: string;
}

export const AI_NOTE_SYSTEM_PROMPT = `你是一位非常擅长写「手帐（journal / 手帳）」风格内容的AI写手。

手帐的核心特点：
- 第一人称、非常私人化、像自己在写日记
- 语言轻松、自然、口语化，有情绪温度（开心、疲惫、感动、小确幸、吐槽都可以）
- 经常出现生活细节、感官描写、内心独白
- 句子长度变化丰富，长短句结合，避免大段流水账
- 适当使用表情符号、换行、分段、emoji，让排版有手写感
- 长度控制：一般150~400字，视场景而定，续写时约100~200字，不要太长
- 内容真实可信，不要突然出现特别夸张或脱离生活的剧情
- 避免过于鸡汤、正能量强制、说教

输出要求（必须严格遵守）：
- 只输出最终的手帐正文（纯文本），可包含换行、emoji、--- 分隔等手帐常用排版
- 禁止输出：markdown 代码块、任何说明文字、「以下是内容」、标题行、对任务的解释
- 默认使用简体中文（除非用户或补充说明里明确指定其它语言）`;

export function buildAiNoteUserMessage(input: AiNotePromptInput, dateKey: string): string {
  const tags = input.tags?.length ? input.tags.join("、") : "无";
  const hint = (input.hint || "").trim() || "无";

  if (input.mode === "generate") {
    return `模式：根据标题从零生成完整手帐正文。

今天日期（供你写具体日期时参考）：${dateKey}
手帐标题：${input.title || ""}
标签：${tags}
用户补充说明（可选）：${hint}

请只输出正文内容，不要其它内容。`;
  }

  if (input.mode === "rewrite") {
    return `模式：改写润色。在保留原意和核心事件的前提下，用更有手帐氛围的表达重写下面全文。

今天日期（供你写具体日期时参考）：${dateKey}
标签：${tags}
改写方向（用户补充说明）：${hint}

【原有正文】
${input.content || ""}

请只输出改写后的正文，不要其它内容。`;
  }

  return `模式：接续写作。在已有正文后面续写，不要重复前面已写的内容，语气、人称、时态与上文一致。

今天日期（供你写具体日期时参考）：${dateKey}
标签：${tags}
续写方向（用户补充说明）：${hint}

【已有正文】
${input.content || ""}

请只输出续写段落（可直接接在上文末尾阅读），不要其它内容。`;
}
