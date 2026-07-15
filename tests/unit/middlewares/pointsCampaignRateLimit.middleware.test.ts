import { describe, expect, it, vi } from "vitest";
import { pointsCampaignClaimRateLimit } from "../../../src/middlewares/pointsCampaignRateLimit.middleware";

function makeCtx(userId?: string) {
  return {
    ip: "10.0.0.9",
    request: { ip: "10.0.0.9" },
    user: userId ? { userId } : undefined,
    status: 200,
    body: undefined,
    set: vi.fn(),
  } as any;
}

describe("unit: pointsCampaignClaimRateLimit", () => {
  it("未超限时放行 next", async () => {
    const ctx = makeCtx("u-rate-1");
    const next = vi.fn(async () => undefined);
    await pointsCampaignClaimRateLimit(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("同一用户短时超限返回 429", async () => {
    const userId = `u-rate-burst-${Date.now()}`;
    const next = vi.fn(async () => undefined);
    for (let i = 0; i < 5; i += 1) {
      await pointsCampaignClaimRateLimit(makeCtx(userId), next);
    }
    const blocked = makeCtx(userId);
    await pointsCampaignClaimRateLimit(blocked, next);
    expect(blocked.status).toBe(429);
    expect(next).toHaveBeenCalledTimes(5);
  });
});
