import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db";
import AiStyle from "../src/model/AiStyle";

type Args = {
  all: boolean;
  styleKeys: string[];
  yes: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { all: false, styleKeys: [], yes: false, dryRun: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") out.all = true;
    else if (a === "--yes") out.yes = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--no-dry-run") out.dryRun = false;
    else if (a === "--styleKey" || a === "--styleKeys") {
      const v = argv[i + 1] ?? "";
      i++;
      out.styleKeys.push(
        ...v
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      );
    } else if (a.startsWith("--styleKey=") || a.startsWith("--styleKeys=")) {
      const v = a.split("=", 2)[1] ?? "";
      out.styleKeys.push(
        ...v
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      );
    }
  }

  // 默认 dry-run，只有明确 --yes 且未显式 dryRun 才执行
  if (out.yes && out.dryRun) {
    // allow explicit: --yes --no-dry-run
  } else if (out.yes && !out.dryRun) {
    // execute
  } else {
    out.dryRun = true;
  }

  // 去重
  out.styleKeys = Array.from(new Set(out.styleKeys));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.all && args.styleKeys.length === 0) {
    console.log(
      [
        "用法：",
        "  pnpm -C backend tsx scripts/removeAiStyles.ts --all [--yes --no-dry-run]",
        "  pnpm -C backend tsx scripts/removeAiStyles.ts --styleKey minimal_record,custom_general [--yes --no-dry-run]",
        "",
        "说明：",
        "  - 默认 dry-run（只打印，不删除）",
        "  - 真正删除需要同时带：--yes --no-dry-run",
        "  - 注意：后端启动时会执行 AiStyleService.ensureSeed()，会把种子风格重新插入（只对缺失的 styleKey 生效）。",
      ].join("\n"),
    );
    process.exit(1);
  }

  await connectDB();

  const filter = args.all ? {} : { styleKey: { $in: args.styleKeys } };

  const candidates = await AiStyle.find(filter, { styleKey: 1, name: 1, subtitle: 1 }).sort({
    order: 1,
    updatedAt: -1,
  });

  if (candidates.length === 0) {
    console.log("未匹配到任何 AI 风格记录，无需删除。");
    await mongoose.disconnect();
    return;
  }

  console.log(`将匹配到 ${candidates.length} 条 AI 风格：`);
  for (const d of candidates) {
    console.log(
      `- ${d.styleKey} | ${d.name}${d.subtitle ? ` | ${d.subtitle}` : ""} | _id=${String(d._id)}`,
    );
  }

  if (args.dryRun) {
    console.log("\n当前为 dry-run：未执行删除。若确认删除，请加参数：--yes --no-dry-run");
    await mongoose.disconnect();
    return;
  }

  if (!args.yes) {
    console.log("\n未提供 --yes，已中止。");
    await mongoose.disconnect();
    process.exit(1);
  }

  const r = await AiStyle.deleteMany(filter);
  console.log(`\n删除完成：deletedCount=${r.deletedCount ?? 0}`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("脚本执行失败：", e);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
