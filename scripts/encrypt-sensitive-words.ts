/**
 * 敏感词加密脚本
 * 用于将敏感词列表加密存储，防止代码泄露
 *
 * 使用方法：
 * 1. 修改下面的 rawWords 数组，添加你的敏感词
 * 2. 运行：npx tsx scripts/encrypt-sensitive-words.ts
 * 3. 生成的 sensitive-words.bin 文件用于生产环境
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url"; // 新增：引入fileURLToPath处理路径

// 从环境变量获取密钥，如果没有则使用默认值（仅用于开发环境）
const ENCRYPTION_KEY =
  process.env.SENSITIVE_WORDS_KEY || "your-32-byte-encryption-key-here-123456";

// 确保密钥是32字节
const KEY = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
const IV = Buffer.alloc(16, 0); // 初始化向量
const ALGORITHM = "aes-256-cbc";

// 原始敏感词列表（这里使用现有的敏感词，可以根据需要修改）

let rawWords = [
  // 暴力相关
  "炸弹",
  "恐怖",
  "暴力",
  "杀人",
  "伤害",
  "袭击",
  "爆炸",
  // 色情相关
  "色情",
  "淫秽",
  "嫖娼",
  "卖淫",
  "强奸",
  "猥亵",
  // 违法相关
  "毒品",
  "吸毒",
  "贩毒",
  "赌博",
  "诈骗",
  "盗窃",
  // 政治敏感
  "反动",
  "邪教",
  "分裂",
  "颠覆",
  "暴乱",
  // 其他
  "自杀",
  "自残",
  "仇恨",
  "歧视",
];
// 1. 先获取当前文件的完整路径（替代__filename）
// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
// 2. 再获取当前文件所在目录（替代__dirname）
const __dirname = path.dirname(__filename);

console.log("dirname==>", __dirname);
const filePath = path.join(__dirname, "./note.txt");

function handleFile() {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const arr = content.split("\r\n");
    console.log("文件内容长度:", content.length);
    console.log("数组长度:", arr.length);
    // console.log("文件内容数组:", arr);
    rawWords = [...rawWords, ...arr];
  } catch (error) {
    console.error("读取文件失败:", error);
  }
}
handleFile();

/**
 * 加密敏感词列表
 */
function encryptSensitiveWords(): void {
  try {
    console.log("🔐 开始加密敏感词列表...");
    console.log(`📊 敏感词数量: ${rawWords.length}`);

    // 创建加密器
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, IV);

    // 将敏感词数组转换为JSON字符串并加密
    const jsonString = JSON.stringify(rawWords);
    let encrypted = cipher.update(jsonString, "utf8", "hex");
    encrypted += cipher.final("hex");

    // 写入加密文件
    const outputPath = path.join(__dirname, "..", "sensitive-words.bin");
    fs.writeFileSync(outputPath, encrypted);

    console.log("✅ 敏感词加密完成！");
    console.log(`📁 加密文件已保存到: ${outputPath}`);
    console.log(
      "⚠️  请确保将 SENSITIVE_WORDS_KEY 环境变量设置为正确的加密密钥",
    );

    // 显示环境变量配置示例
    console.log("\n📋 环境变量配置示例:");
    console.log("SENSITIVE_WORDS_KEY=your-32-byte-encryption-key-here-123456");
  } catch (error) {
    console.error("❌ 加密失败:", error);
    process.exit(1);
  }
}

/**
 * 测试解密功能
 */
function testDecryption(): void {
  try {
    console.log("\n🔍 测试解密功能...");

    const inputPath = path.join(__dirname, "..", "sensitive-words.bin");
    if (!fs.existsSync(inputPath)) {
      console.log("⚠️  加密文件不存在，跳过测试");
      return;
    }

    const encryptedData = fs.readFileSync(inputPath, "utf8");
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, IV);
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    const wordsArray = JSON.parse(decrypted);
    console.log(`✅ 解密成功！敏感词数量: ${wordsArray.length}`);
    console.log("📋 前5个敏感词:", wordsArray.slice(0, 5));
  } catch (error) {
    console.error("❌ 解密测试失败:", error);
  }
}

// 执行加密
encryptSensitiveWords();

// 测试解密
testDecryption();

console.log("\n🎉 脚本执行完成！");
console.log(
  "💡 提示: 在生产环境中，请确保 SENSITIVE_WORDS_KEY 环境变量安全存储",
);
