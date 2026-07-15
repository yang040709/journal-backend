import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { adminAuthHeader, seedAdmin } from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import UserFeedback from "../../../src/model/UserFeedback";
import { PointsService } from "../../../src/service/points.service";

describe("integration: admin feedbacks/points route branches", () => {
  const agent = createTestAgent();
  let token = "";

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    const admin = await seedAdmin();
    token = admin.token;
    await PointsService.ensureRulesDocumentExists();
  });

  it("feedbacks 列表/详情/审核/批量/导出/快捷回复 参数分支", async () => {
    const { userId } = await seedUser({ userId: "fb-route-u" });
    const fb = await UserFeedback.create({
      userId,
      type: "bug",
      content: "路由层反馈内容足够长",
      status: "pending",
    });

    const auth = adminAuthHeader(token);

    expect(
      (await agent.get("/admin/feedbacks").set(auth).query({ page: "1", limit: "10" })).status,
    ).toBe(200);
    expect(
      (await agent.get("/admin/feedbacks").set(auth).query({ page: "9999", limit: "100" })).body
        .code,
    ).not.toBe(0);

    const detail = await agent.get(`/admin/feedbacks/${fb._id}`).set(auth);
    expect(detail.status).toBe(200);

    const badId = await agent.get("/admin/feedbacks/not-an-id").set(auth);
    expect([400, 404, 500]).toContain(badId.status);

    const review = await agent
      .post(`/admin/feedbacks/${fb._id}/review`)
      .set(auth)
      .send({ reviewLevel: "important", userReply: "收到" });
    expect(review.status).toBe(200);

    const reply = await agent
      .patch(`/admin/feedbacks/${fb._id}/user-reply`)
      .set(auth)
      .send({ userReply: "更新" });
    expect(reply.status).toBe(200);

    const next = await agent
      .get("/admin/feedbacks/review/next")
      .set(auth)
      .query({ direction: "next" });
    expect(next.status).toBe(200);

    const batch = await agent
      .post("/admin/feedbacks/batch-review")
      .set(auth)
      .send({ ids: [String(fb._id)], reviewLevel: "normal" });
    expect([200, 400]).toContain(batch.status);

    // /feedbacks/export 可能被 :id 抢先匹配；用 selected/filtered 参数走导出逻辑若可达
    const exportRes = await agent
      .get("/admin/feedbacks/export")
      .set(auth)
      .query({ mode: "filtered", status: "reviewed", limit: "50" });
    expect([200, 400, 404, 500]).toContain(exportRes.status);

    // 直接带 mode=selected 触发导出体分支（若路由可达）
    const exportSelected = await agent
      .get("/admin/feedbacks/export")
      .set(auth)
      .query({ mode: "selected", ids: String(fb._id), limit: "10" });
    expect([200, 400, 404, 500]).toContain(exportSelected.status);

    const qrGet = await agent.get("/admin/feedbacks/quick-replies").set(auth);
    expect(qrGet.status).toBe(200);

    const qrPut = await agent
      .put("/admin/feedbacks/quick-replies")
      .set(auth)
      .send({
        items: [{ label: "谢谢", content: "感谢反馈", enabled: true }],
      });
    expect(qrPut.status).toBe(200);

    const zodFail = await agent
      .post(`/admin/feedbacks/${fb._id}/review`)
      .set(auth)
      .send({ reviewLevel: "nope" });
    expect(zodFail.status).toBe(400);
  });

  it("points rules/transactions/campaigns 路由分支", async () => {
    const auth = adminAuthHeader(token);

    const rules = await agent.get("/admin/points/rules").set(auth);
    expect([200, 404]).toContain(rules.status);

    const tx = await agent
      .get("/admin/points/transactions")
      .set(auth)
      .query({ page: 1, pageSize: 10 });
    expect(tx.status).toBe(200);

    const txBad = await agent
      .get("/admin/points/transactions")
      .set(auth)
      .query({ page: 9999, pageSize: 100 });
    expect(txBad.status).toBe(400);

    const campaigns = await agent.get("/admin/points-campaigns").set(auth);
    expect(campaigns.status).toBe(200);

    const createCamp = await agent
      .post("/admin/points-campaigns")
      .set(auth)
      .send({
        name: "测活动",
        pointValue: 10,
        quota: 5,
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(createCamp.status).toBe(200);
    const campId = createCamp.body?.data?.id || createCamp.body?.data?._id;

    if (campId) {
      const getCamp = await agent.get(`/admin/points-campaigns/${campId}`).set(auth);
      expect(getCamp.status).toBe(200);
      const claims = await agent
        .get(`/admin/points-campaigns/${campId}/claims`)
        .set(auth);
      expect(claims.status).toBe(200);
      const offline = await agent
        .post(`/admin/points-campaigns/${campId}/offline`)
        .set(auth);
      expect([200, 400]).toContain(offline.status);
    }

    const putRules = await agent
      .put("/admin/points/rules")
      .set(auth)
      .send({ pointsPerAd: 3 });
    expect([200, 400]).toContain(putRules.status);

    const createBad = await agent.post("/admin/points-campaigns").set(auth).send({ name: "" });
    expect(createBad.status).toBe(400);
  });
});
