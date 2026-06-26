import COS from "cos-nodejs-sdk-v5";

function getCosClient() {
  const secretId = process.env.COS_SECRET_ID || "";
  const secretKey = process.env.COS_SECRET_KEY || "";
  if (!secretId || !secretKey) {
    throw new Error("COS credentials missing");
  }
  return new COS({ SecretId: secretId, SecretKey: secretKey });
}

export function isCosObjectKey(key: string): boolean {
  const k = String(key || "").trim();
  return Boolean(k && k.includes("/") && !k.startsWith("cover:"));
}

export function extractCosKeyFromUrl(url: string): string | null {
  const raw = String(url || "").trim();
  if (!raw) return null;

  const publicDomain = String(process.env.COS_PUBLIC_DOMAIN || "")
    .trim()
    .replace(/\/$/, "");
  if (publicDomain && raw.startsWith(`${publicDomain}/`)) {
    return raw.slice(publicDomain.length + 1);
  }

  try {
    const parsed = new URL(raw);
    const path = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (path.includes("/")) return path;
  } catch {
    /* ignore invalid URL */
  }

  return null;
}

export async function deleteCosObjects(
  keys: string[],
  options: { timeoutMs?: number } = {},
): Promise<{ deletedKeys: number }> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const deleteTask = deleteCosObjectsInternal(keys);
  const timeoutTask = new Promise<{ deletedKeys: number }>((_, reject) => {
    setTimeout(() => reject(new Error("COS delete timeout")), timeoutMs);
  });
  return Promise.race([deleteTask, timeoutTask]);
}

async function deleteCosObjectsInternal(keys: string[]): Promise<{ deletedKeys: number }> {
  const bucket = process.env.COS_BUCKET || "";
  const region = process.env.COS_REGION || "";
  if (!bucket || !region) throw new Error("COS_BUCKET/COS_REGION missing");

  const uniqueKeys = [
    ...new Set(
      keys.map((k) => String(k || "").trim()).filter((k) => isCosObjectKey(k)),
    ),
  ];
  if (!uniqueKeys.length) return { deletedKeys: 0 };

  const cos = getCosClient();
  const objects = uniqueKeys.map((Key) => ({ Key }));
  const chunkSize = 1000;
  let deletedKeys = 0;

  for (let i = 0; i < objects.length; i += chunkSize) {
    const batch = objects.slice(i, i + chunkSize);
    await new Promise<void>((resolve, reject) => {
      cos.deleteMultipleObject(
        {
          Bucket: bucket,
          Region: region,
          Objects: batch,
          Quiet: true,
        },
        (err, data) => {
          if (err) return reject(err);
          const deleted = Array.isArray((data as { Deleted?: unknown[] })?.Deleted)
            ? (data as { Deleted: unknown[] }).Deleted.length
            : 0;
          deletedKeys += deleted;
          resolve();
        },
      );
    });
  }

  return { deletedKeys };
}
