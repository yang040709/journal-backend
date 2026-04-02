import { CACHE_CONFIG } from "../config/cache";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function normalizeCacheKeyPart(value: unknown): string {
  if (value == null) return "_";
  if (typeof value === "string") return value.trim() || "_";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCacheKeyPart(item)).join(",");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${normalizeCacheKeyPart(v)}`);
    return entries.join("&") || "_";
  }
  return String(value);
}

export function buildCacheKey(...parts: unknown[]): string {
  return parts.map((part) => normalizeCacheKeyPart(part)).join(":");
}

export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
): Promise<T> {
  if (!CACHE_CONFIG.enabled || ttlSeconds <= 0) {
    return producer();
  }

  const now = Date.now();
  const existing = memoryCache.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.value as T;
  }

  const running = inflight.get(key);
  if (running) {
    return running as Promise<T>;
  }

  const promise = producer()
    .then((value) => {
      memoryCache.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateCacheByPrefix(prefix: string): void {
  if (!prefix) return;
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

