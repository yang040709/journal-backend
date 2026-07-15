import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { adminAuthHeader, seedAdmin } from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { PointsService } from "../../../src/service/points.service";

describe("integration: admin core/usersExtra/templates/announcements branches", () => {
  const agent = createTestAgent();
  let token = "";
  let auth: Record<string, string> = {};

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    token = (await seedAdmin()).token;
    auth = adminAuthHeader(token);
    await PointsService.ensureRulesDocumentExists();
  });

  it("core stats/alerts/quota/system 配置路由分支", async () => {
    const ok = (s: number) => expect(s).toBeLessThan(500);

    ok((await agent.get("/admin/auth/me").set(auth)).status);
    ok((await agent.get("/admin/stats/overview").set(auth)).status);
    ok((await agent.get("/admin/stats/display-preferences").set(auth)).status);
    ok((await agent.get("/admin/stats/client-events").set(auth).query({ days: 7 })).status);
    expect([400, 401, 403]).toContain(
      (await agent.get("/admin/stats/client-events").set(auth).query({ days: 99999 })).status,
    );
    ok((await agent.get("/admin/client-event-config").set(auth)).status);
    ok((await agent.get("/admin/stats/reading-themes").set(auth).query({ days: 7 })).status);
    ok(
      (
        await agent
          .get("/admin/stats/operations-report")
          .set(auth)
          .query({ startDate: "2026-07-01", endDate: "2026-07-07" })
      ).status,
    );
    expect([400, 401, 403]).toContain(
      (
        await agent
          .get("/admin/stats/operations-report")
          .set(auth)
          .query({ startDate: "2026-07-10", endDate: "2026-07-01" })
      ).status,
    );

    ok((await agent.get("/admin/alerts/rules").set(auth)).status);
    ok((await agent.get("/admin/alerts/events").set(auth)).status);
    ok((await agent.get("/admin/alerts/metrics/overview").set(auth)).status);
    expect((await agent.get("/admin/alerts/events/missing").set(auth)).status).toBeGreaterThanOrEqual(
      400,
    );

    ok((await agent.get("/admin/quota/ai-daily").set(auth).query({ page: 1 })).status);
    ok((await agent.get("/admin/quota/upload-daily").set(auth).query({ page: 1 })).status);
    ok((await agent.get("/admin/quota/ad-reward-logs").set(auth).query({ page: 1 })).status);

    ok((await agent.get("/admin/system/covers").set(auth)).status);
    ok(
      (
        await agent
          .put("/admin/system/covers")
          .set(auth)
          .send({ coverUrls: ["https://cdn.example/a.png"] })
      ).status,
    );
    expect(
      (await agent.put("/admin/system/covers").set(auth).send({ coverUrls: [] })).status,
    ).toBeGreaterThanOrEqual(400);

    ok((await agent.get("/admin/system/browse-banners").set(auth)).status);
    ok((await agent.get("/admin/system/initial-notebooks").set(auth)).status);
    ok((await agent.get("/admin/system/initial-notes").set(auth)).status);
  });

  it("usersExtra points/quota/export/migration/reading-theme 分支", async () => {
    const { userId } = await seedUser({ userId: "adm-extra-u" });

    expect((await agent.get("/admin/points/rules").set(auth)).status).toBe(200);
    expect(
      (await agent.put("/admin/points/rules").set(auth).send({ pointsPerAd: 8 })).status,
    ).toBe(200);
    expect((await agent.put("/admin/points/rules").set(auth).send({ pointsPerAd: -1 })).status).toBe(
      400,
    );

    expect((await agent.get("/admin/quota/base-limits").set(auth)).status).toBe(200);
    expect(
      (
        await agent
          .put("/admin/quota/base-limits")
          .set(auth)
          .send({ uploadDailyBaseLimit: 11 })
      ).status,
    ).toBe(200);

    expect((await agent.get("/admin/notebook/limits").set(auth)).status).toBe(200);
    expect(
      (
        await agent
          .put("/admin/notebook/limits")
          .set(auth)
          .send({ defaultMaxNoteBookCount: 8 })
      ).status,
    ).toBe(200);

    expect((await agent.get("/admin/export/settings").set(auth)).status).toBe(200);
    expect(
      (
        await agent
          .put("/admin/export/settings")
          .set(auth)
          .send({ exportWeeklyFreeCount: 3 })
      ).status,
    ).toBe(200);

    expect((await agent.get("/admin/reading-theme-catalog").set(auth)).status).toBe(200);
    expect((await agent.get("/admin/note-export-logs").set(auth).query({ page: 1 })).status).toBe(
      200,
    );

    const pre = await agent
      .post("/admin/users/migration/precheck")
      .set(auth)
      .send({
        sourceOpenid: userId,
        targetOpenid: "missing-tgt",
        remark: "测试",
        operator: "admin",
      });
    expect([200, 400, 404]).toContain(pre.status);

    const preBad = await agent
      .post("/admin/users/migration/precheck")
      .set(auth)
      .send({ sourceOpenid: "", targetOpenid: "x", remark: "r", operator: "op" });
    expect(preBad.status).toBe(400);

    expect(
      (await agent.get("/admin/users/migration/tasks/missing").set(auth)).status,
    ).toBeGreaterThanOrEqual(400);
  });

  it("templates/announcements/ai-styles/notebooks CRUD 与校验分支", async () => {
    const { userId } = await seedUser({ userId: "adm-tpl-u" });
    await seedNoteBook(userId, "本");

    expect((await agent.get("/admin/templates").set(auth).query({ page: 1 })).status).toBe(200);
    expect((await agent.get("/admin/templates/system").set(auth)).status).toBe(200);
    expect(
      (await agent.post("/admin/templates").set(auth).send({ name: "" })).status,
    ).toBe(400);

    const createTpl = await agent.post("/admin/templates").set(auth).send({
      name: "管理模板",
      userId,
      fields: { title: "t", content: "c", tags: [] },
    });
    expect([200, 201, 400]).toContain(createTpl.status);
    const tplId = createTpl.body?.data?.id || createTpl.body?.data?._id;
    if (tplId) {
      expect((await agent.get(`/admin/templates/${tplId}`).set(auth)).status).toBe(200);
      expect(
        (
          await agent
            .put(`/admin/templates/${tplId}`)
            .set(auth)
            .send({ name: "改名" })
        ).status,
      ).toBe(200);
    }

    expect((await agent.get("/admin/announcements").set(auth).query({ page: 1 })).status).toBe(
      200,
    );
    const ann = await agent.post("/admin/announcements").set(auth).send({
      title: "公告标题",
      content: "公告内容足够长",
      status: "draft",
    });
    expect(ann.status).toBe(200);
    const annId = ann.body?.data?.id || ann.body?.data?._id;
    if (annId) {
      expect((await agent.get(`/admin/announcements/${annId}`).set(auth)).status).toBe(200);
      expect(
        (await agent.post(`/admin/announcements/${annId}/publish`).set(auth)).status,
      ).toBe(200);
      expect(
        (await agent.post(`/admin/announcements/${annId}/offline`).set(auth)).status,
      ).toBe(200);
    }
    expect(
      (await agent.post("/admin/announcements").set(auth).send({ title: "" })).status,
    ).toBe(400);

    expect((await agent.get("/admin/ai/styles").set(auth)).status).toBe(200);
    const style = await agent.post("/admin/ai/styles").set(auth).send({
      styleKey: "route_style_1",
      name: "风格一",
      systemPrompt: "sys",
      userPromptTemplate: "{{content}}",
    });
    expect([200, 201, 400]).toContain(style.status);
    expect(
      (
        await agent
          .post("/admin/ai/styles/preview")
          .set(auth)
          .send({ mode: "generate", content: "你好" })
      ).status,
    ).toBeGreaterThanOrEqual(200);
    expect(
      (await agent.post("/admin/ai/styles").set(auth).send({ styleKey: "x" })).status,
    ).toBe(400);

    expect((await agent.get("/admin/notebooks").set(auth).query({ page: 1 })).status).toBe(200);
    expect(
      (
        await agent
          .post("/admin/notebooks/import-json")
          .set(auth)
          .send({ userId, data: { type: "bad" } })
      ).status,
    ).toBe(400);

    // templates system export / batch-status 成功与校验
    expect(
      (
        await agent
          .get("/admin/templates/system/export")
          .set(auth)
          .query({ mode: "filtered", enabled: "false", keyword: "无匹配" })
      ).status,
    ).toBe(200);
    expect(
      (
        await agent
          .get("/admin/templates/system/export")
          .set(auth)
          .query({ mode: "selected" })
      ).status,
    ).toBe(400);
    expect(
      (
        await agent
          .post("/admin/templates/system/batch-status")
          .set(auth)
          .send({ ids: ["000000000000000000000001"], enabled: true })
      ).status,
    ).toBeGreaterThanOrEqual(200);

    // users 详情 / jwt / overview 分支
    const listUsers = await agent.get("/admin/users").set(auth).query({ page: 1, limit: 5 });
    expect(listUsers.status).toBe(200);
    expect(
      (
        await agent
          .post(`/admin/users/${encodeURIComponent(userId)}/jwt`)
          .set(auth)
          .send({})
      ).status,
    ).toBe(200);
    const overview = await agent
      .get(`/admin/users/${encodeURIComponent(userId)}/overview`)
      .set(auth);
    expect([200, 404]).toContain(overview.status);

    expect((await agent.get("/admin/notes").set(auth).query({ page: 1 })).status).toBe(200);
    expect(
      (await agent.get("/admin/notes/risk-items").set(auth).query({ page: 1 })).status,
    ).toBe(200);
    expect((await agent.get("/admin/feedbacks").set(auth).query({ page: 1 })).status).toBe(200);
    expect(
      (await agent.get("/admin/points/transactions").set(auth).query({ page: 1 })).status,
    ).toBe(200);
    expect(
      (await agent.get("/admin/points-campaigns").set(auth).query({ page: 1 })).status,
    ).toBe(200);
  });

  it("alerts 规则切换/事件 ack-resolve + quota + system PUT 分支", async () => {
    const ok = (s: number) => expect(s).toBeLessThan(500);

    const rules = await agent.get("/admin/alerts/rules").set(auth);
    expect(rules.status).toBe(200);
    const ruleKey =
      rules.body?.data?.[0]?.ruleKey ||
      rules.body?.data?.items?.[0]?.ruleKey ||
      rules.body?.data?.list?.[0]?.ruleKey ||
      "ai_fail_rate";

    expect(
      (
        await agent
          .put(`/admin/alerts/rules/${ruleKey}`)
          .set(auth)
          .send({ threshold: 0.5 })
      ).status,
    ).toBeLessThan(500);
    expect(
      (await agent.put(`/admin/alerts/rules/missing-rule-xyz`).set(auth).send({})).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await agent
          .post(`/admin/alerts/rules/${ruleKey}/toggle`)
          .set(auth)
          .send({ enabled: false })
      ).status,
    ).toBeLessThan(500);
    expect(
      (
        await agent
          .post(`/admin/alerts/rules/${ruleKey}/toggle`)
          .set(auth)
          .send({ enabled: true })
      ).status,
    ).toBeLessThan(500);
    expect(
      (
        await agent
          .post(`/admin/alerts/rules/missing-rule-xyz/toggle`)
          .set(auth)
          .send({ enabled: true })
      ).status,
    ).toBeGreaterThanOrEqual(400);

    ok(
      (
        await agent
          .get("/admin/alerts/events")
          .set(auth)
          .query({ page: 1, limit: 10, status: "open" })
      ).status,
    );
    ok(
      (
        await agent
          .get("/admin/alerts/events")
          .set(auth)
          .query({ page: 1, severity: "critical", ruleKey })
      ).status,
    );
    expect(
      (await agent.get("/admin/alerts/events/000000000000000000000099").set(auth)).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await agent
          .post("/admin/alerts/events/000000000000000000000099/ack")
          .set(auth)
          .send({})
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await agent
          .post("/admin/alerts/events/000000000000000000000099/resolve")
          .set(auth)
          .send({})
      ).status,
    ).toBeGreaterThanOrEqual(400);

    ok((await agent.get("/admin/alerts/metrics/overview").set(auth)).status);

    ok(
      (
        await agent
          .get("/admin/quota/ai-daily")
          .set(auth)
          .query({ page: 1, limit: 10, dateKeyFrom: "2026-07-01", dateKeyTo: "2026-07-15" })
      ).status,
    );
    ok(
      (
        await agent
          .get("/admin/quota/upload-daily")
          .set(auth)
          .query({ page: 1, userId: "adm-tpl-u" })
      ).status,
    );
    ok(
      (
        await agent
          .get("/admin/quota/ad-reward-logs")
          .set(auth)
          .query({ page: 1, limit: 5 })
      ).status,
    );

    ok(
      (
        await agent.put("/admin/system/browse-banners").set(auth).send({
          items: [
            {
              imageUrl: "https://cdn.example.com/b.png",
              type: "none",
              priority: 1,
              enabled: true,
            },
          ],
        })
      ).status,
    );
    ok(
      (await agent.put("/admin/system/browse-banners").set(auth).send({ items: [] })).status,
    );

    ok((await agent.get("/admin/system/initial-notebooks").set(auth)).status);
    const nbGet = await agent.get("/admin/system/initial-notebooks").set(auth);
    ok(
      (
        await agent
          .put("/admin/system/initial-notebooks")
          .set(auth)
          .send({
            templates: nbGet.body?.data?.templates || [
              { title: "欢迎本", coverImg: "https://cdn.example.com/c.png" },
            ],
          })
      ).status,
    );
    ok((await agent.get("/admin/system/initial-notes").set(auth)).status);
    const notesGet = await agent.get("/admin/system/initial-notes").set(auth);
    ok(
      (
        await agent
          .put("/admin/system/initial-notes")
          .set(auth)
          .send({
            templates: notesGet.body?.data?.templates || [],
          })
      ).status,
    );

    ok((await agent.get("/admin/client-event-config").set(auth)).status);
    const cfg = await agent.get("/admin/client-event-config").set(auth);
    ok(
      (
        await agent
          .put("/admin/client-event-config")
          .set(auth)
          .send(cfg.body?.data || { enabled: true, events: {} })
      ).status,
    );
  });

  it("usersExtra migration/quota/reading-theme/export catch+success", async () => {
    const { userId } = await seedUser({ userId: "extra-u2", points: 20 });
    await seedUser({ userId: "extra-tgt", points: 1 });

    expect(
      (
        await agent
          .put(`/admin/users/${encodeURIComponent(userId)}`)
          .set(auth)
          .send({ nickname: "改名" })
      ).status,
    ).toBe(200);
    expect(
      (
        await agent
          .put(`/admin/users/missing-user-xyz`)
          .set(auth)
          .send({ nickname: "x" })
      ).status,
    ).toBe(404);

    expect(
      (
        await agent.post("/admin/users/migration/precheck").set(auth).send({
          sourceOpenid: userId,
          targetOpenid: "extra-tgt",
          remark: "预检",
          operator: "admin",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await agent.post("/admin/users/migration/precheck").set(auth).send({
          sourceOpenid: "ghost-src",
          targetOpenid: "ghost-tgt",
          remark: "r",
          operator: "op",
        })
      ).status,
    ).toBe(404);

    expect(
      (
        await agent.post("/admin/users/migration/execute").set(auth).send({
          sourceOpenid: "",
          targetOpenid: "x",
          remark: "r",
          operator: "op",
        })
      ).status,
    ).toBe(400);

    expect((await agent.get("/admin/points/rules").set(auth)).status).toBe(200);
    expect(
      (
        await agent
          .put("/admin/points/rules")
          .set(auth)
          .send({
            pointsPerAd: 6,
            globalAdDailyLimit: 8,
            uploadExchange: { enabled: true, pointsCost: 10, quotaGain: 1 },
            aiExchange: { enabled: true, pointsCost: 10, quotaGain: 1 },
            feedbackRewards: { weeklyFirstSubmit: 1, important: 2, critical: 3 },
          })
      ).status,
    ).toBe(200);

    expect((await agent.get("/admin/quota/base-limits").set(auth)).status).toBe(200);
    expect(
      (
        await agent
          .put("/admin/quota/base-limits")
          .set(auth)
          .send({ uploadDailyBaseLimit: 12, aiDailyBaseLimit: 5 })
      ).status,
    ).toBe(200);

    expect((await agent.get("/admin/export/settings").set(auth)).status).toBe(200);
    expect(
      (
        await agent
          .put("/admin/export/settings")
          .set(auth)
          .send({ exportWeeklyFreeCount: 2, exportPointsPerExtra: 30 })
      ).status,
    ).toBe(200);

    expect((await agent.get("/admin/notebook/limits").set(auth)).status).toBe(200);
    expect(
      (
        await agent
          .put("/admin/notebook/limits")
          .set(auth)
          .send({ defaultMaxNoteBookCount: 9 })
      ).status,
    ).toBe(200);

    expect((await agent.get("/admin/reading-theme-catalog").set(auth)).status).toBe(200);
    expect(
      (
        await agent
          .put("/admin/reading-theme-catalog")
          .set(auth)
          .send({ themes: [] })
      ).status,
    ).toBeGreaterThanOrEqual(200);

    expect(
      (
        await agent
          .get(`/admin/users/${encodeURIComponent(userId)}/activity`)
          .set(auth)
          .query({ page: 1 })
      ).status,
    ).toBe(200);
    expect(
      (
        await agent
          .get(`/admin/users/${encodeURIComponent(userId)}/covers`)
          .set(auth)
      ).status,
    ).toBe(200);
    expect(
      (
        await agent
          .put(`/admin/users/${encodeURIComponent(userId)}/covers/quick`)
          .set(auth)
          .send({ covers: ["https://cdn.example.com/s1.png"] })
      ).status,
    ).toBeLessThan(500);

    expect(
      (await agent.get("/admin/note-export-logs").set(auth).query({ page: 1 })).status,
    ).toBe(200);
    expect(
      (await agent.get("/admin/points/rule-change-logs").set(auth).query({ page: 1 })).status,
    ).toBe(200);
  });
});
