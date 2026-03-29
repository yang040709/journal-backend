import Template from "../model/Template";
import { noteTemplates } from "@/constant/templates.js";

/**
 * 若库中尚无系统模板，则将当前代码常量写入 MongoDB（之后以数据库为准）。
 */
export async function ensureSystemTemplates(): Promise<void> {
  const n = await Template.countDocuments({ isSystem: true });
  if (n > 0) {
    return;
  }
  const docs = noteTemplates.map((t) => ({
    userId: "system",
    name: t.name,
    description: t.description,
    fields: t.fields,
    isSystem: true,
    systemKey: t.id,
  }));
  await Template.insertMany(docs);
  console.log(`[Template] 已种子系统内置模板 ${docs.length} 条`);
}
