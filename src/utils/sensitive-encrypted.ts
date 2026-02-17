/**
 * 加密敏感词检查工具
 * 使用 AES-256-CBC 加密敏感词库，程序启动时解密并初始化 DFA 引擎
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Mint } from "mint-filter";
import { logger } from "./logger";

// 全局敏感词过滤器实例
let sensitiveFilter: Mint | null = null;

// 加密配置
const ALGORITHM = "aes-256-cbc";
// const ENCRYPTION_KEY =  process.env.SENSITIVE_WORDS_KEY || "your-32-byte-encryption-key-here-123456";
const ENCRYPTION_KEY = "your-32-byte-encryption-key-here-123456";
const KEY = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
const IV = Buffer.alloc(16, 0); // 初始化向量

// 加密文件路径 - 使用相对于项目根目录的路径
const ENCRYPTED_WORDS_PATH = path.join(process.cwd(), "sensitive-words.bin");
/**
 * 解密敏感词列表
 */
function decryptSensitiveWords(): string[] {
  try {
    if (!fs.existsSync(ENCRYPTED_WORDS_PATH)) {
      logger.warn("加密敏感词文件不存在，使用空敏感词列表", {
        filePath: ENCRYPTED_WORDS_PATH,
      });
      return [];
    }

    const encryptedData = fs.readFileSync(ENCRYPTED_WORDS_PATH, "utf8");
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, IV);
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    const wordsArray = JSON.parse(decrypted);

    if (!Array.isArray(wordsArray)) {
      throw new Error("解密后的数据不是有效的数组");
    }

    logger.info("敏感词库解密成功", {
      wordCount: wordsArray.length,
      filePath: ENCRYPTED_WORDS_PATH,
    });

    return wordsArray;
  } catch (error) {
    logger.error("敏感词库解密失败", {
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      filePath: ENCRYPTED_WORDS_PATH,
    });

    // 返回空数组，避免应用崩溃
    return [];
  }
}

/**
 * 初始化敏感词过滤器
 * 应该在应用启动时调用
 */
export async function initSensitiveFilter(): Promise<void> {
  try {
    logger.info("开始初始化敏感词过滤器...");

    // 解密敏感词
    const sensitiveWords = decryptSensitiveWords();

    if (sensitiveWords.length === 0) {
      logger.warn("敏感词列表为空，过滤器将不会生效");
      sensitiveFilter = null;
      return;
    }

    // 初始化 mint-filter DFA 引擎
    sensitiveFilter = new Mint(sensitiveWords);

    logger.info("敏感词过滤器初始化成功", {
      wordCount: sensitiveWords.length,
      filterType: "mint-filter DFA",
    });

    // 测试过滤器
    const testResult = sensitiveFilter.filter("这是一个测试文本");
    logger.debug("敏感词过滤器测试完成", {
      hasSensitiveWords: testResult.words.length > 0,
      testWords: testResult.words,
    });
  } catch (error) {
    logger.error("敏感词过滤器初始化失败", {
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    sensitiveFilter = null;
  }
}

/**
 * 检查文本中是否包含敏感词
 * @param text 要检查的文本
 * @returns 包含的敏感词数组，如果没有则返回空数组
 */
export function checkSensitiveWords(text: string): string[] {
  if (!text || typeof text !== "string") {
    return [];
  }

  if (!sensitiveFilter) {
    logger.warn("敏感词过滤器未初始化，跳过检查");
    return [];
  }

  try {
    const result = sensitiveFilter.filter(text);
    return result.words;
  } catch (error) {
    logger.error("敏感词检查失败", {
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
      text: text.substring(0, 100), // 只记录前100个字符
    });
    return [];
  }
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

  if (!sensitiveFilter) {
    logger.warn("敏感词过滤器未初始化，跳过替换");
    return text;
  }

  try {
    const result = sensitiveFilter.filter(text);

    if (result.words.length === 0) {
      return text;
    }

    // 使用 mint-filter 的过滤功能替换敏感词
    let processedText = text;
    for (const word of result.words) {
      const regex = new RegExp(word, "gi");
      processedText = processedText.replace(regex, "***");
    }

    return processedText;
  } catch (error) {
    logger.error("敏感词替换失败", {
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
      text: text.substring(0, 100),
    });
    return text;
  }
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

/**
 * 获取敏感词过滤器状态
 */
export function getSensitiveFilterStatus(): {
  isInitialized: boolean;
  wordCount: number;
  algorithm: string;
} {
  if (!sensitiveFilter) {
    return {
      isInitialized: false,
      wordCount: 0,
      algorithm: "mint-filter DFA",
    };
  }

  // 注意：mint-filter 不直接提供词库数量，这里我们返回一个估计值
  return {
    isInitialized: true,
    wordCount: -1, // 无法直接获取
    algorithm: "mint-filter DFA",
  };
}

/**
 * 重新加载敏感词过滤器
 * 用于热更新敏感词库
 */
export async function reloadSensitiveFilter(): Promise<boolean> {
  try {
    logger.info("开始重新加载敏感词过滤器...");

    // 解密最新的敏感词
    const sensitiveWords = decryptSensitiveWords();

    if (sensitiveWords.length === 0) {
      logger.warn("重新加载的敏感词列表为空");
      sensitiveFilter = null;
      return false;
    }

    // 创建新的过滤器
    const newFilter = new Mint(sensitiveWords);

    // 原子性替换
    sensitiveFilter = newFilter;

    logger.info("敏感词过滤器重新加载成功", {
      wordCount: sensitiveWords.length,
    });

    return true;
  } catch (error) {
    logger.error("敏感词过滤器重新加载失败", {
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    return false;
  }
}
