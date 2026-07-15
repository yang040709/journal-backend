import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import {
  adminAuthHeader,
  seedAdmin,
  seedNotesAdmin,
} from "../../helpers/adminFactory";
import { authHeader, createAuthUser } from "../../helpers/authFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { ErrorCodes } from "../../../src/utils/response";
import { AdminDisplayPreferenceStatsService } from "../../../src/service/adminDisplayPreferenceStats.service";

describe("integration: admin display preference stats", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    AdminDisplayPreferenceStatsService.invalidateReportCache();
  });

  it("super GET /admin/stats/display-preferences 返回默认统计", async () => {
    const { token } = await seedAdmin();
    await createAuthUser({ userId: "display-stats-user-1" });

    const res = await agent
      .get("/admin/stats/display-preferences")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.totalUsers).toBe(1);
    expect(res.body.data.settings).toHaveLength(5);
    expect(res.body.data.settings[0]).toMatchObject({
      key: "showNoteWordCount",
      usersConfiguredCount: 0,
      changeCount: 0,
    });
  });

  it("统计包含设置人数、变更次数与热门选项", async () => {
    const { token: adminToken } = await seedAdmin();
    const { token } = await createAuthUser({ userId: "display-stats-user-2" });

    await agent
      .put("/auth/me/display-preference")
      .set(authHeader(token))
      .send({
        showNoteWordCount: true,
        albumCoverNoImageStyle: "watermark",
      })
      .expect(200);

    await agent
      .put("/auth/me/display-preference")
      .set(authHeader(token))
      .send({ showNoteWordCount: false })
      .expect(200);

    const res = await agent
      .get("/admin/stats/display-preferences")
      .set(adminAuthHeader(adminToken))
      .expect(200);

    const wordCountStat = res.body.data.settings.find(
      (item: { key: string }) => item.key === "showNoteWordCount",
    );
    expect(wordCountStat.usersConfiguredCount).toBe(1);
    expect(wordCountStat.changeCount).toBe(2);
    expect(wordCountStat.popularOption.value).toBe("false");

    const styleStat = res.body.data.settings.find(
      (item: { key: string }) => item.key === "albumCoverNoImageStyle",
    );
    expect(styleStat.usersConfiguredCount).toBe(1);
    expect(styleStat.changeCount).toBe(1);
    expect(styleStat.popularOption.value).toBe("watermark");
  });

  it("普通 admin GET /admin/stats/display-preferences 返回 403", async () => {
    const { token } = await seedNotesAdmin();
    const res = await agent
      .get("/admin/stats/display-preferences")
      .set(adminAuthHeader(token))
      .expect(403);

    expect(res.body.code).toBe(ErrorCodes.PERMISSION_ERROR);
  });
});
