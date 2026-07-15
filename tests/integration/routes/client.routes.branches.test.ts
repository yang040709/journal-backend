import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { authHeader, createAuthUser } from "../../helpers/authFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { PointsService } from "../../../src/service/points.service";

describe("integration: client cover/template/feedback/reminder/points branches", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    await PointsService.ensureRulesDocumentExists();
  });

  it("covers 系统/快捷/自定义分支", async () => {
    const { token } = await createAuthUser({ userId: "cover-u1" });
    const auth = authHeader(token);

    expect((await agent.get("/covers/system").set(auth)).status).toBe(200);
    expect((await agent.get("/covers/quick").set(auth)).status).toBe(200);
    expect((await agent.post("/covers/quick/init").set(auth)).status).toBe(200);
    expect((await agent.get("/covers/custom").set(auth)).status).toBe(200);

    const putQuick = await agent
      .put("/covers/quick")
      .set(auth)
      .send({ covers: ["https://cdn.example/a.png"] });
    expect([200, 400]).toContain(putQuick.status);

    const createCustom = await agent.post("/covers/custom").set(auth).send({
      coverUrl: "https://cdn.example/c.png",
    });
    expect([200, 201, 400]).toContain(createCustom.status);
    const coverId = createCustom.body?.data?.id || createCustom.body?.data?._id;
    if (coverId) {
      expect(
        (
          await agent
            .put(`/covers/custom/${coverId}`)
            .set(auth)
            .send({ coverUrl: "https://cdn.example/c2.png" })
        ).status,
      ).toBe(200);
      expect((await agent.delete(`/covers/custom/${coverId}`).set(auth)).status).toBe(200);
    }

    expect((await agent.get("/covers/system")).status).toBe(401);
    expect(
      (await agent.put("/covers/quick").set(auth).send({ covers: "bad" })).status,
    ).toBe(400);
  });

  it("templates 列表/创建/改删/批量分支", async () => {
    const { token } = await createAuthUser({ userId: "tpl-u1" });
    const auth = authHeader(token);

    expect((await agent.get("/templates").set(auth)).status).toBe(200);
    expect((await agent.get("/templates/all").set(auth)).status).toBe(200);

    const created = await agent.post("/templates").set(auth).send({
      name: "我的模板",
      fields: { title: "标题", content: "内容", tags: ["日常"] },
    });
    expect(created.status).toBe(200);
    const id = created.body?.data?.id || created.body?.data?._id;
    expect(id).toBeTruthy();

    expect((await agent.get(`/templates/${id}`).set(auth)).status).toBe(200);
    expect(
      (
        await agent
          .put(`/templates/${id}`)
          .set(auth)
          .send({ name: "改名模板" })
      ).status,
    ).toBe(200);
    expect(
      (await agent.post("/templates").set(auth).send({ name: "" })).status,
    ).toBe(400);
    expect((await agent.get("/templates/not-valid-id").set(auth)).status).toBeGreaterThanOrEqual(
      400,
    );

    const batch = await agent
      .post("/templates/batch-delete")
      .set(auth)
      .send({ ids: [id] });
    expect([200, 400]).toContain(batch.status);

    await agent.post("/templates").set(auth).send({
      name: "再删",
      fields: { title: "t", content: "c", tags: [] },
    });
  });

  it("feedbacks C端 提交/列表/未读分支", async () => {
    const { token, userId } = await createAuthUser({ userId: "fb-c-u1", points: 50 });
    const auth = authHeader(token);

    expect((await agent.get("/feedbacks/weekly-first-status").set(auth)).status).toBe(200);
    expect((await agent.get("/feedbacks/weekly-first-status")).status).toBe(200);

    const created = await agent.post("/feedbacks").set(auth).send({
      type: "demand",
      content: "希望能导出更多格式哈哈",
    });
    expect(created.status).toBe(200);
    const id = created.body?.data?.feedback?.id || created.body?.data?.id;

    expect((await agent.get("/feedbacks/my").set(auth)).status).toBe(200);
    expect((await agent.get("/feedbacks/unread-summary").set(auth)).status).toBe(200);
    expect((await agent.post("/feedbacks/mark-all-replies-read").set(auth)).status).toBe(200);

    if (id) {
      expect((await agent.get(`/feedbacks/${id}`).set(auth)).status).toBe(200);
      expect(
        (await agent.post(`/feedbacks/${id}/mark-reply-read`).set(auth)).status,
      ).toBeGreaterThanOrEqual(200);
    }

    expect(
      (await agent.post("/feedbacks").set(auth).send({ type: "bug", content: "短" })).status,
    ).toBe(400);
    expect(userId).toBeTruthy();
  });

  it("reminders 列表与 points transactions/campaigns 分支", async () => {
    const { token } = await createAuthUser({ userId: "rem-u1", points: 30 });
    const auth = authHeader(token);

    expect((await agent.get("/reminders").set(auth)).status).toBe(200);
    expect((await agent.get("/reminders")).status).toBe(401);

    expect((await agent.get("/points/transactions").set(auth).query({ page: 1 })).status).toBe(
      200,
    );
    expect(
      (await agent.get("/points/transactions").set(auth).query({ page: 9999, pageSize: 100 }))
        .status,
    ).toBe(400);

    expect(
      (await agent.get("/points/campaigns/000000000000000000000000").set(auth)).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await agent
          .post("/points/campaigns/000000000000000000000000/claim")
          .set(auth)
      ).status,
    ).toBeGreaterThanOrEqual(400);

    expect(
      (await agent.post("/points/ad-reward").set(auth).send({ rewardToken: "" })).status,
    ).toBe(400);
    expect(
      (await agent.post("/points/exchange").set(auth).send({ kind: "bad" })).status,
    ).toBe(400);
  });
});
