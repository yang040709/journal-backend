import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { adminAuthHeader, seedAdmin, seedNotesAdmin } from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { buildDefaultReadingThemeCatalog } from "../../../src/utils/readingThemeCatalog";
import { ErrorCodes } from "../../../src/utils/response";

describe("integration: admin reading theme catalog", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("super GET /admin/reading-theme-catalog 返回 catalog 与 manifest", async () => {
    const { token } = await seedAdmin();
    const res = await agent
      .get("/admin/reading-theme-catalog")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.catalog.styleKeys[0]).toBeNull();
    expect(res.body.data.manifest.length).toBeGreaterThan(0);
    expect(res.body.data.manifest[0].themes.length).toBeGreaterThan(0);

    const filmTravel = res.body.data.manifest.find(
      (item: { styleKey: string }) => item.styleKey === "filmTravel",
    );
    expect(filmTravel?.label).toBe("胶片旅行风");
    expect(filmTravel?.themes.map((theme: { id: string }) => theme.id)).toEqual([
      "film-default",
      "film-golden",
      "film-mintTrail",
      "film-sakuraPass",
    ]);
    expect(res.body.data.catalog.styleKeys).toContain("filmTravel");
  });

  it("普通 admin GET /admin/reading-theme-catalog 返回 403", async () => {
    const { token } = await seedNotesAdmin();
    const res = await agent
      .get("/admin/reading-theme-catalog")
      .set(adminAuthHeader(token))
      .expect(403);

    expect(res.body.code).toBe(ErrorCodes.PERMISSION_ERROR);
  });

  it("super PUT /admin/reading-theme-catalog 可保存并回读", async () => {
    const { token } = await seedAdmin();
    const defaults = buildDefaultReadingThemeCatalog();
    const payload = {
      styleKeys: [null, "journal"],
      themeIdsByStyle: {
        journal: defaults.themeIdsByStyle.journal.slice(0, 1),
      },
    };

    const putRes = await agent
      .put("/admin/reading-theme-catalog")
      .set(adminAuthHeader(token))
      .send(payload)
      .expect(200);

    expect(putRes.body.data.catalog.styleKeys).toEqual([null, "journal"]);
    expect(putRes.body.data.catalog.themeIdsByStyle.journal).toHaveLength(1);

    const getRes = await agent
      .get("/admin/reading-theme-catalog")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(getRes.body.data.catalog.styleKeys).toEqual([null, "journal"]);
  });

  it("PUT 缺少标准阅读时返回 400", async () => {
    const { token } = await seedAdmin();
    const res = await agent
      .put("/admin/reading-theme-catalog")
      .set(adminAuthHeader(token))
      .send({
        styleKeys: ["journal"],
        themeIdsByStyle: { journal: ["minimalist_white"] },
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });
});
