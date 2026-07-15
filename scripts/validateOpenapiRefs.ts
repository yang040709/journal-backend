import fs from "fs";
import path from "path";

const specPath = path.resolve(
  process.cwd(),
  "..",
  "docs",
  "spec",
  "openapi",
  "openapi.json",
);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const schemas = new Set(Object.keys(spec.components?.schemas || {}));
const refs: string[] = [];

function walk(o: unknown) {
  if (!o || typeof o !== "object") return;
  const obj = o as Record<string, unknown>;
  if (typeof obj.$ref === "string") refs.push(obj.$ref);
  for (const v of Object.values(obj)) walk(v);
}

walk(spec);

const broken = refs
  .filter((r) => r.startsWith("#/components/schemas/"))
  .map((r) => r.replace("#/components/schemas/", ""))
  .filter((n) => !schemas.has(n));

const pathCount = Object.keys(spec.paths || {}).length;

console.log("paths:", pathCount);
console.log("schemas:", schemas.size);
console.log("refs:", refs.length);
console.log("broken:", broken.length, broken.slice(0, 20));

if (broken.length > 0) {
  console.error("❌ OpenAPI spec 存在 unresolved $ref");
  process.exit(1);
}

console.log("✅ OpenAPI spec 校验通过");
