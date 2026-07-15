import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { authHeader, createAuthUser } from "../../helpers/authFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";

vi.mock("../../../src/service/cover.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/service/cover.service")>();
  const S = actual.CoverService;
  const out: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(S)) {
    if (["length", "name", "prototype"].includes(key)) continue;
    const v = (S as Record<string, unknown>)[key];
    if (typeof v === "function") {
      out[key] = vi.fn((v as (...a: unknown[]) => unknown).bind(S));
    }
  }
  return { ...actual, CoverService: out };
});

import { CoverService } from "../../../src/service/cover.service";

describe("integration: cover routes catch branches", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("covers Zod / service failures", async () => {
    const { token } = await createAuthUser({ userId: "cover-catch-u" });
    const auth = authHeader(token);

    const getSystem = CoverService.getSystemCovers as ReturnType<typeof vi.fn>;
    const getQuick = CoverService.getUserQuickCovers as ReturnType<typeof vi.fn>;
    const setQuick = CoverService.updateUserQuickCovers as ReturnType<typeof vi.fn>;
    const listCustom = CoverService.getUserCustomCovers as ReturnType<typeof vi.fn>;
    const createCustom = CoverService.addUserCustomCover as ReturnType<typeof vi.fn>;
    const updateCustom = CoverService.updateUserCustomCover as ReturnType<typeof vi.fn>;
    const deleteCustom = CoverService.deleteUserCustomCover as ReturnType<typeof vi.fn>;

    getSystem.mockRejectedValueOnce(new Error("boom-sys"));
    expect((await agent.get("/covers/system").set(auth)).status).toBeGreaterThanOrEqual(400);

    getQuick.mockRejectedValueOnce(new Error("boom-quick"));
    expect((await agent.get("/covers/quick").set(auth)).status).toBeGreaterThanOrEqual(400);

    expect((await agent.put("/covers/quick").set(auth).send({ covers: "bad" })).status).toBe(
      400,
    );
    setQuick.mockRejectedValueOnce(new Error("boom-set"));
    expect(
      (
        await agent
          .put("/covers/quick")
          .set(auth)
          .send({ covers: ["https://cdn.example/a.png"] })
      ).status,
    ).toBeGreaterThanOrEqual(400);

    listCustom.mockRejectedValueOnce(new Error("boom-list"));
    expect((await agent.get("/covers/custom").set(auth)).status).toBeGreaterThanOrEqual(400);

    expect((await agent.post("/covers/custom").set(auth).send({})).status).toBe(400);
    createCustom.mockRejectedValueOnce(new Error("boom-create"));
    expect(
      (
        await agent
          .post("/covers/custom")
          .set(auth)
          .send({ coverUrl: "https://cdn.example/c.png" })
      ).status,
    ).toBeGreaterThanOrEqual(400);

    updateCustom.mockRejectedValueOnce(new Error("封面不存在"));
    expect(
      (
        await agent
          .put("/covers/custom/000000000000000000000001")
          .set(auth)
          .send({ coverUrl: "https://cdn.example/c2.png" })
      ).status,
    ).toBeGreaterThanOrEqual(400);

    deleteCustom.mockRejectedValueOnce(new Error("封面不存在"));
    expect(
      (await agent.delete("/covers/custom/000000000000000000000002").set(auth)).status,
    ).toBeGreaterThanOrEqual(400);
  });
});
