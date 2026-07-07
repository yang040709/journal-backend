import fs from "fs";
import path from "path";

const routesRoot = path.resolve(process.cwd(), "src", "routes");

function listRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...listRouteFiles(full));
    } else if (
      e.name.endsWith(".routes.ts") ||
      (e.name === "index.ts" && dir.endsWith(`${path.sep}admin`))
    ) {
      files.push(full);
    }
  }
  return files;
}

function countInFile(filePath: string) {
  const content = fs.readFileSync(filePath, "utf8");
  const routes =
    (content.match(/router\.(get|post|put|patch|delete)\(/g) || []).length;
  const openapiBlocks = (content.match(/@openapi/g) || []).length;
  const isAdmin = filePath.includes(`${path.sep}admin${path.sep}`);
  return { routes, openapiBlocks, isAdmin };
}

const files = listRouteFiles(routesRoot).sort();
const rows = files.map((f) => ({
  file: path.relative(routesRoot, f).replace(/\\/g, "/"),
  ...countInFile(f),
}));

function sum(filter: (r: (typeof rows)[0]) => boolean) {
  return rows.filter(filter).reduce(
    (acc, r) => ({
      routes: acc.routes + r.routes,
      openapi: acc.openapi + r.openapiBlocks,
    }),
    { routes: 0, openapi: 0 },
  );
}

const client = sum((r) => !r.file.startsWith("admin/"));
const admin = sum((r) => r.file.startsWith("admin/"));
const total = sum(() => true);

console.log("| 文件 | 端点 | @openapi | 覆盖率 |");
console.log("|------|------|----------|--------|");
for (const r of rows) {
  const pct =
    r.routes === 0
      ? "—"
      : `${Math.min(100, Math.round((r.openapiBlocks / r.routes) * 100))}%`;
  console.log(`| ${r.file} | ${r.routes} | ${r.openapiBlocks} | ${pct} |`);
}

const fmt = (label: string, s: { routes: number; openapi: number }) => {
  const pct =
    s.routes === 0 ? 0 : Math.min(100, Math.round((s.openapi / s.routes) * 100));
  console.log(`\n${label}: ${s.openapi}/${s.routes} (${pct}%)`);
};

fmt("C 端合计", client);
fmt("Admin 合计", admin);
fmt("总计", total);

const adminPct =
  admin.routes === 0 ? 100 : Math.round((admin.openapi / admin.routes) * 100);
if (adminPct < 90) {
  console.error(`\n⚠️  Admin 覆盖率 ${adminPct}% 低于目标 90%`);
  process.exit(1);
}
