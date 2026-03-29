import fs from "fs";
import path from "path";
import type { Context, Next } from "koa";

const STATIC_ROOT = path.join(__dirname, "..", "src", "static");

const MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

/**
 * 提供 `src/static` 下的文件，URL 前缀 `/static/`（例如 `/static/logo.svg`）
 */
export async function staticFilesMiddleware(ctx: Context, next: Next) {
  if (!ctx.path.startsWith("/static/")) {
    await next();
    return;
  }
  const rel = decodeURIComponent(ctx.path.slice("/static/".length));
  if (!rel || rel.includes("..") || path.isAbsolute(rel)) {
    ctx.status = 400;
    return;
  }
  const filePath = path.join(STATIC_ROOT, rel);
  let st: fs.Stats;
  try {
    st = fs.statSync(filePath);
  } catch {
    await next();
    return;
  }
  if (!st.isFile()) {
    await next();
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  ctx.type = MIME[ext] || "application/octet-stream";
  ctx.set("Cache-Control", "public, max-age=86400");
  ctx.body = fs.createReadStream(filePath);
}
