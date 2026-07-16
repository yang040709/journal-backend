import { describe, expect, it, afterEach } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import {
  PRODUCT_RELEASE_DATE,
  PRODUCT_VERSION,
} from "../../../src/constant/productVersion.generated";

describe("GET /health", () => {
  const prevSha = process.env.GIT_SHA;

  afterEach(() => {
    if (prevSha === undefined) {
      delete process.env.GIT_SHA;
    } else {
      process.env.GIT_SHA = prevSha;
    }
  });

  it("returns product version and gitSha without auth", async () => {
    process.env.GIT_SHA = "abc123def456";
    const agent = createTestAgent();
    const res = await agent.get("/health");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.productVersion).toBe(PRODUCT_VERSION);
    expect(res.body.releaseDate).toBe(PRODUCT_RELEASE_DATE);
    expect(res.body.gitSha).toBe("abc123def456");
    expect(typeof res.body.uptime).toBe("number");
  });

  it("defaults gitSha to dev when GIT_SHA unset", async () => {
    delete process.env.GIT_SHA;
    const agent = createTestAgent();
    const res = await agent.get("/health");

    expect(res.status).toBe(200);
    expect(res.body.gitSha).toBe("dev");
  });
});
