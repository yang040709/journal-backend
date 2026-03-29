/** 去掉模型常见包裹与噪声前缀，用于正文或 JSON 字符串 */
export const sanitizeModelText = (raw: string): string => {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\s*/m, "").replace(/\s*```$/m, "").trim();
  }
  const noisePrefixes = [/^(以下是|以下為|以下是)[^：:]*[：:]\s*/u, /^(正文|内容)[：:]\s*/u];
  for (const re of noisePrefixes) {
    text = text.replace(re, "").trim();
  }
  return text.trim();
};
