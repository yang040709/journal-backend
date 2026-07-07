import fs from "fs";
import path from "path";

const routesRoot = path.resolve(process.cwd(), "src", "routes");
const specPath = path.resolve(
  process.cwd(),
  "..",
  "docs",
  "spec",
  "openapi",
  "openapi.json",
);

type RouteEntry = { method: string; path: string };

function normalizePath(prefix: string, routePath: string): string {
  const p = `${prefix}${routePath}`.replace(/\/+/g, "/");
  return p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p;
}

/** OpenAPI uses {id}; Koa router uses :id */
function canonicalPath(p: string): string {
  return p.replace(/:(\w+)/g, "{$1}");
}

function extractRoutesFromFile(
  filePath: string,
  basePrefix: string,
): RouteEntry[] {
  const content = fs.readFileSync(filePath, "utf8");
  let filePrefix = basePrefix;
  const prefixMatch = content.match(
    /new Router\(\{\s*prefix:\s*["']([^"']+)["']/,
  );
  if (prefixMatch) {
    filePrefix = normalizePath("", prefixMatch[1]);
  }

  const entries: RouteEntry[] = [];
  const re =
    /router\.(get|post|put|patch|delete)\(\s*\n?\s*["'`]([^"'`]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    entries.push({
      method: m[1].toUpperCase(),
      path: canonicalPath(normalizePath(filePrefix, m[2])),
    });
  }
  return entries;
}

function listRouteFiles(): { file: string; prefix: string }[] {
  const out: { file: string; prefix: string }[] = [];

  for (const e of fs.readdirSync(routesRoot, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".routes.ts")) {
      out.push({ file: path.join(routesRoot, e.name), prefix: "" });
    }
    if (e.isDirectory() && e.name === "note") {
      for (const n of fs.readdirSync(path.join(routesRoot, "note"))) {
        if (n.endsWith(".routes.ts")) {
          out.push({
            file: path.join(routesRoot, "note", n),
            prefix: "/notes",
          });
        }
      }
    }
    if (e.isDirectory() && e.name === "admin") {
      for (const n of fs.readdirSync(path.join(routesRoot, "admin"))) {
        if (n.endsWith(".routes.ts") || n === "index.ts") {
          out.push({
            file: path.join(routesRoot, "admin", n),
            prefix: n === "index.ts" ? "" : "/admin",
          });
        }
      }
    }
  }
  return out;
}

function collectCodeRoutes(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  function add(entry: RouteEntry) {
    if (!map.has(entry.path)) map.set(entry.path, new Set());
    map.get(entry.path)!.add(entry.method);
  }

  for (const { file, prefix } of listRouteFiles()) {
    for (const e of extractRoutesFromFile(file, prefix)) add(e);
  }

  return map;
}

function collectSpecRoutes(): Map<string, Set<string>> {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const map = new Map<string, Set<string>>();
  for (const [p, methods] of Object.entries(spec.paths || {})) {
    const set = new Set<string>();
    for (const method of Object.keys(methods as object)) {
      if (method !== "parameters") set.add(method.toUpperCase());
    }
    map.set(canonicalPath(p), set);
  }
  return map;
}

function key(pathStr: string, method: string) {
  return `${method} ${pathStr}`;
}

const code = collectCodeRoutes();
const spec = collectSpecRoutes();

const missingInSpec: string[] = [];
const extraInSpec: string[] = [];

for (const [p, methods] of code) {
  const specMethods = spec.get(p);
  if (!specMethods) {
    for (const m of methods) missingInSpec.push(key(p, m));
    continue;
  }
  for (const m of methods) {
    if (!specMethods.has(m)) missingInSpec.push(key(p, m));
  }
}

for (const [p, methods] of spec) {
  const codeMethods = code.get(p);
  if (!codeMethods) {
    for (const m of methods) extraInSpec.push(key(p, m));
    continue;
  }
  for (const m of methods) {
    if (!codeMethods.has(m)) extraInSpec.push(key(p, m));
  }
}

console.log("代码路由:", [...code.values()].reduce((n, s) => n + s.size, 0));
console.log("Spec 路由:", [...spec.values()].reduce((n, s) => n + s.size, 0));
console.log("Spec 缺失:", missingInSpec.length);
if (missingInSpec.length) {
  console.log(missingInSpec.slice(0, 30).join("\n"));
  if (missingInSpec.length > 30) {
    console.log(`... +${missingInSpec.length - 30} more`);
  }
}
console.log("Spec 多余:", extraInSpec.length);
if (extraInSpec.length) {
  console.log(extraInSpec.slice(0, 20).join("\n"));
}

if (missingInSpec.length > 0 || extraInSpec.length > 0) {
  process.exit(1);
}

console.log("✅ Spec 与代码路由一致");
