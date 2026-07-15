import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCacheKey,
  getOrSetCache,
  invalidateCacheByPrefix,
  normalizeCacheKeyPart,
} from "../../../src/utils/cache";
import { CACHE_CONFIG } from "../../../src/config/cache";

describe("unit: cache", () => {
  beforeEach(() => {
    invalidateCacheByPrefix("stats");
    invalidateCacheByPrefix("t");
  });

  it("normalizeCacheKeyPart / buildCacheKey", () => {
    expect(normalizeCacheKeyPart(null)).toBe("_");
    expect(normalizeCacheKeyPart("  a  ")).toBe("a");
    expect(normalizeCacheKeyPart(1)).toBe("1");
    expect(normalizeCacheKeyPart([1, "b"])).toBe("1,b");
    expect(normalizeCacheKeyPart({ b: 2, a: 1 })).toBe("a=1&b=2");
    expect(buildCacheKey("stats", "v1", { x: 1 })).toBe("stats:v1:x=1");
  });

  it("getOrSetCache 命中与 inflight 去重", async () => {
    const prev = CACHE_CONFIG.enabled;
    CACHE_CONFIG.enabled = true;
    const producer = vi.fn(async () => 42);
    const a = getOrSetCache("t:k1", 10, producer);
    const b = getOrSetCache("t:k1", 10, producer);
    expect(await a).toBe(42);
    expect(await b).toBe(42);
    expect(producer).toHaveBeenCalledTimes(1);
    expect(await getOrSetCache("t:k1", 10, producer)).toBe(42);
    expect(producer).toHaveBeenCalledTimes(1);

    CACHE_CONFIG.enabled = false;
    const c = await getOrSetCache("t:k2", 10, async () => 7);
    expect(c).toBe(7);
    CACHE_CONFIG.enabled = prev;
  });
});
