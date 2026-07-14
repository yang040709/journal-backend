import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import {
  adminAuthHeader,
  seedAdmin,
  seedNotesAdmin,
} from "../../helpers/adminFactory";
import { authHeader, createAuthUser } from "../../helpers/authFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import { ErrorCodes } from "../../../src/utils/response";
import { AdminReadingThemeStatsService } from "../../../src/service/adminReadingThemeStats.service";
import ReadingThemeChangeLog from "../../../src/model/ReadingThemeChangeLog";

describe("integration: admin reading theme stats", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    AdminReadingThemeStatsService.invalidateReportCache();
  });

  it("super GET /admin/stats/reading-themes 返回默认统计", async () => {
    const { token } = await seedAdmin();
    await createAuthUser({ userId: "reading-theme-stats-user-1" });

    const res = await agent
      .get("/admin/stats/reading-themes")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.totalUsers).toBe(1);
    expect(res.body.data.days).toBe(30);
    expect(res.body.data.globalScopeUserCount).toBe(0);
    expect(res.body.data.totalGlobalChanges).toBe(0);
    expect(res.body.data.totalNoteChanges).toBe(0);

    const filmTravelStyle = res.body.data.currentGlobal.styleStats.find(
      (item: { styleKey: string | null }) => item.styleKey === "filmTravel",
    );
    expect(filmTravelStyle?.label).toBe("胶片旅行风");
    expect(filmTravelStyle?.userCount).toBe(0);
    expect(filmTravelStyle?.themeStats).toHaveLength(5);
    expect(
      filmTravelStyle?.themeStats.find(
        (item: { themeId: string | null }) => item.themeId === "film-default",
      )?.label,
    ).toBe("银盐胶片");

    expect(res.body.data.currentGlobal.styleStats).toHaveLength(8);
    expect(res.body.data.globalChanges).toEqual([]);
    expect(res.body.data.noteChanges).toEqual([]);
  });

  it("全局 PUT /auth/me/reading-theme 计入 globalChanges 与 currentGlobal", async () => {
    const { token: adminToken } = await seedAdmin();
    const { token } = await createAuthUser({ userId: "reading-theme-stats-global" });

    await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({
        defaultReadingStyleKey: "vintageJournal",
        defaultReadingThemeId: "vintage-rose",
        readingThemeApplyScope: "global",
      })
      .expect(200);

    await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({
        defaultReadingThemeId: "vintage-default",
      })
      .expect(200);

    const res = await agent
      .get("/admin/stats/reading-themes")
      .set(adminAuthHeader(adminToken))
      .expect(200);

    expect(res.body.data.globalScopeUserCount).toBe(1);
    expect(res.body.data.totalGlobalChanges).toBe(2);
    expect(res.body.data.totalNoteChanges).toBe(0);

    const currentStyle = res.body.data.currentGlobal.styleStats.find(
      (item: { styleKey: string | null }) => item.styleKey === "vintageJournal",
    );
    expect(currentStyle.userCount).toBe(1);
    expect(
      currentStyle.themeStats.find(
        (item: { themeId: string | null }) => item.themeId === "vintage-default",
      )?.userCount,
    ).toBe(1);

    const globalStyle = res.body.data.globalChanges.find(
      (item: { styleKey: string | null }) => item.styleKey === "vintageJournal",
    );
    expect(globalStyle.changeCount).toBe(2);
    expect(globalStyle.uniqueUsers).toBe(1);
  });

  it("filmTravel 全局变更计入 globalChanges 与 currentGlobal", async () => {
    const { token: adminToken } = await seedAdmin();
    const { token } = await createAuthUser({ userId: "reading-theme-stats-film-travel" });

    await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({
        defaultReadingStyleKey: "filmTravel",
        defaultReadingThemeId: "film-golden",
        readingThemeApplyScope: "global",
      })
      .expect(200);

    const res = await agent
      .get("/admin/stats/reading-themes")
      .set(adminAuthHeader(adminToken))
      .expect(200);

    const currentStyle = res.body.data.currentGlobal.styleStats.find(
      (item: { styleKey: string | null }) => item.styleKey === "filmTravel",
    );
    expect(currentStyle?.userCount).toBe(1);
    expect(
      currentStyle?.themeStats.find(
        (item: { themeId: string | null }) => item.themeId === "film-golden",
      )?.userCount,
    ).toBe(1);

    const globalStyle = res.body.data.globalChanges.find(
      (item: { styleKey: string | null }) => item.styleKey === "filmTravel",
    );
    expect(globalStyle?.label).toBe("胶片旅行风");
    expect(globalStyle?.changeCount).toBe(1);
    expect(globalStyle?.uniqueUsers).toBe(1);
    expect(
      globalStyle?.themeStats.find(
        (item: { themeId: string | null }) => item.themeId === "film-golden",
      )?.changeCount,
    ).toBe(1);
  });

  it("手帐 PUT /notes/:id 计入 noteChanges", async () => {
    const { token: adminToken } = await seedAdmin();
    const { token, userId } = await createAuthUser({
      userId: "reading-theme-stats-note",
    });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    await agent
      .put(`/notes/${note.id}`)
      .set(authHeader(token))
      .send({ readingStyleKey: "journal", readingThemeId: "sage_green" })
      .expect(200);

    const res = await agent
      .get("/admin/stats/reading-themes")
      .set(adminAuthHeader(adminToken))
      .expect(200);

    expect(res.body.data.totalNoteChanges).toBe(1);
    expect(res.body.data.totalGlobalChanges).toBe(0);

    const noteStyle = res.body.data.noteChanges.find(
      (item: { styleKey: string | null }) => item.styleKey === "journal",
    );
    expect(noteStyle.changeCount).toBe(1);
    expect(noteStyle.uniqueUsers).toBe(1);
    expect(
      noteStyle.themeStats.find(
        (item: { themeId: string | null }) => item.themeId === "sage_green",
      )?.changeCount,
    ).toBe(1);
  });

  it("days 过滤仅统计时间范围内变更", async () => {
    const { token: adminToken } = await seedAdmin();
    await ReadingThemeChangeLog.create({
      userId: "old-change-user",
      scope: "global",
      readingStyleKey: "journal",
      readingThemeId: "minimalist_white",
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    });
    await ReadingThemeChangeLog.create({
      userId: "recent-change-user",
      scope: "global",
      readingStyleKey: "journal",
      readingThemeId: "sage_green",
    });

    const recentRes = await agent
      .get("/admin/stats/reading-themes?days=30")
      .set(adminAuthHeader(adminToken))
      .expect(200);

    expect(recentRes.body.data.totalGlobalChanges).toBe(1);

    const wideRes = await agent
      .get("/admin/stats/reading-themes?days=90")
      .set(adminAuthHeader(adminToken))
      .expect(200);

    expect(wideRes.body.data.totalGlobalChanges).toBe(2);
  });

  it("普通 admin GET /admin/stats/reading-themes 返回 403", async () => {
    const { token } = await seedNotesAdmin();
    const res = await agent
      .get("/admin/stats/reading-themes")
      .set(adminAuthHeader(token))
      .expect(403);

    expect(res.body.code).toBe(ErrorCodes.PERMISSION_ERROR);
  });
});
