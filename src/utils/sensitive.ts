/**
 * 敏感词检查工具
 */

const SENSITIVE_WORDS = ["炸弹", "test敏感词"];

/**
 * 检查文本中是否包含敏感词
 * @param text 要检查的文本
 * @returns 包含的敏感词数组，如果没有则返回空数组
 */
export function checkSensitiveWords(text: string): string[] {
  if (!text || typeof text !== "string") {
    return [];
  }

  const foundWords: string[] = [];

  for (const word of SENSITIVE_WORDS) {
    if (text.includes(word)) {
      foundWords.push(word);
    }
  }

  return foundWords;
}

/**
 * 替换文本中的敏感词为 ***
 * @param text 要处理的文本
 * @returns 处理后的文本
 */
export function replaceSensitiveWords(text: string): string {
  if (!text || typeof text !== "string") {
    return text;
  }

  let result = text;

  for (const word of SENSITIVE_WORDS) {
    // 创建正则表达式，全局匹配且不区分大小写
    const regex = new RegExp(word, "gi");
    result = result.replace(regex, "***");
  }

  return result;
}

/**
 * 检查并替换文本中的敏感词
 * @param text 要处理的文本
 * @returns 包含处理结果的对象
 */
export function checkAndReplaceSensitiveContent(text: string): {
  hasSensitiveWords: boolean;
  sensitiveWords: string[];
  processedText: string;
  wasReplaced: boolean;
} {
  const sensitiveWords = checkSensitiveWords(text);
  const hasSensitiveWords = sensitiveWords.length > 0;

  let processedText = text;
  let wasReplaced = false;

  if (hasSensitiveWords) {
    processedText = replaceSensitiveWords(text);
    wasReplaced = true;
  }

  return {
    hasSensitiveWords,
    sensitiveWords,
    processedText,
    wasReplaced,
  };
}

/**
 * 检查手帐内容（标题和内容）
 * @param title 手帐标题
 * @param content 手帐内容
 * @returns 检查结果
 */
export function checkNoteContent(
  title: string,
  content: string,
): {
  titleHasSensitive: boolean;
  contentHasSensitive: boolean;
  titleSensitiveWords: string[];
  contentSensitiveWords: string[];
  processedTitle: string;
  processedContent: string;
  hasAnySensitive: boolean;
} {
  const titleResult = checkAndReplaceSensitiveContent(title);
  const contentResult = checkAndReplaceSensitiveContent(content);

  return {
    titleHasSensitive: titleResult.hasSensitiveWords,
    contentHasSensitive: contentResult.hasSensitiveWords,
    titleSensitiveWords: titleResult.sensitiveWords,
    contentSensitiveWords: contentResult.sensitiveWords,
    processedTitle: titleResult.processedText,
    processedContent: contentResult.processedText,
    hasAnySensitive:
      titleResult.hasSensitiveWords || contentResult.hasSensitiveWords,
  };
}
