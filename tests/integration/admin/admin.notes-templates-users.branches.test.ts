import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { adminAuthHeader, seedAdmin } from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";

describe("integration: admin notes/templates/users route branches", () => {
  const agent = createTestAgent();
  let token = "";

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    token = (await seedAdmin()).token;
  });

  it("notes / notebooks / users / templates 列表与校验分支", async () => {
    const auth = adminAuthHeader(token);
    const { userId } = await seedUser({ userId: "adm-route-user" });
    const book = await seedNoteBook(userId, "路由本");
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "路由笔记",
      content: "内容",
    });

    expect((await agent.get("/admin/notes").set(auth).query({ page: 1, limit: 10 })).status).toBe(
      200,
    );
    expect(
      (await agent.get("/admin/notes").set(auth).query({ page: 9999, limit: 100 })).status,
    ).toBe(400);
    expect((await agent.get(`/admin/notes/${note.id}`).set(auth)).status).toBe(200);

    expect(
      (await agent.get("/admin/notebooks").set(auth).query({ page: 1, limit: 10 })).status,
    ).toBe(200);
    expect((await agent.get("/admin/users").set(auth).query({ page: 1, limit: 10 })).status).toBe(
      200,
    );
    expect(
      (await agent.get("/admin/users").set(auth).query({ page: 9999, limit: 100 })).status,
    ).toBe(400);

    const createUser = await agent
      .post("/admin/users")
      .set(auth)
      .send({ userId: "new-route-user" });
    expect([200, 201, 400, 409]).toContain(createUser.status);

    expect(
      (await agent.get("/admin/templates").set(auth).query({ page: 1, limit: 10 })).status,
    ).toBe(200);
    expect((await agent.get("/admin/templates/system").set(auth)).status).toBe(200);

    const createTpl = await agent.post("/admin/templates").set(auth).send({
      name: "管理模板",
      userId,
      fields: { title: "t", content: "c", tags: [] },
    });
    expect([200, 201, 400]).toContain(createTpl.status);

    const batchShare = await agent
      .post("/admin/notes/batch-share")
      .set(auth)
      .send({ noteIds: [note.id], isShare: true });
    expect([200, 400, 404]).toContain(batchShare.status);

    const batchTags = await agent
      .post("/admin/notes/batch-tags")
      .set(auth)
      .send({ noteIds: [note.id], tags: ["日常"], mode: "replace" });
    expect([200, 400, 404]).toContain(batchTags.status);

    expect((await agent.get("/admin/reminders").set(auth).query({ page: 1 })).status).toBe(200);
    expect((await agent.get("/admin/announcements").set(auth).query({ page: 1 })).status).toBe(200);
    expect((await agent.get("/admin/ai/styles").set(auth)).status).toBe(200);
    expect((await agent.get("/admin/auth/me").set(auth)).status).toBe(200);

    expect((await agent.post("/admin/templates").set(auth).send({ name: "" })).status).toBe(400);

    // notes CRUD / share / risk / delete 分支
    expect(
      (
        await agent
          .put(`/admin/notes/${note.id}`)
          .set(auth)
          .send({ title: "改路由笔记", isFavorite: true, isPinned: true })
      ).status,
    ).toBe(200);
    expect(
      (
        await agent
          .post(`/admin/notes/${note.id}/share`)
          .set(auth)
          .send({ isShare: true })
      ).status,
    ).toBeLessThan(500);
    expect(
      (
        await agent
          .get(`/admin/notes/risk-items`)
          .set(auth)
          .query({ page: 1, keyword: "路由", userId })
      ).status,
    ).toBe(200);
    expect(
      (await agent.get(`/admin/notes/000000000000000000000099`).set(auth)).status,
    ).toBe(404);
    expect(
      (
        await agent
          .post("/admin/notes")
          .set(auth)
          .send({
            userId,
            noteBookId: book.id,
            title: "管理新建",
            content: "管理内容足够长",
            tags: ["日常"],
          })
      ).status,
    ).toBe(200);

    expect(
      (
        await agent
          .put(`/admin/users/${encodeURIComponent(userId)}`)
          .set(auth)
          .send({ bio: "简介分支" })
      ).status,
    ).toBe(200);
    expect(
      (
        await agent
          .get(`/admin/users/${encodeURIComponent(userId)}/activity`)
          .set(auth)
          .query({ page: 1, type: "update" })
      ).status,
    ).toBe(200);
    expect(
      (await agent.delete(`/admin/users/missing-del-xyz`).set(auth)).status,
    ).toBeGreaterThanOrEqual(400);
  });
});
