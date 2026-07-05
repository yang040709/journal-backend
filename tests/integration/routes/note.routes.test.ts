import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { authHeader, createAuthUser } from "../../helpers/authFactory";
import { adminAuthHeader, seedAdmin } from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedNote } from "../../helpers/seed/note.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { ErrorCodes } from "../../../src/utils/response";
import { buildDefaultReadingThemeCatalog } from "../../../src/utils/readingThemeCatalog";

describe("integration: /notes", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("GET /notes 无 token 返回 401", async () => {
    await agent.get("/notes").expect(401);
  });

  it("POST /notes 创建手帐", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);

    const res = await agent
      .post("/notes")
      .set(authHeader(token))
      .send({
        noteBookId: book.id,
        title: "今日心情",
        content: "阳光很好",
        tags: [],
      })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.title).toBe("今日心情");
    expect(res.body.data.noteBookId).toBe(book.id);
  });

  it("POST /notes 跨用户手帐本返回 404", async () => {
    const owner = await createAuthUser({ userId: "note-owner" });
    const other = await createAuthUser({ userId: "note-other" });
    const book = await seedNoteBook(owner.userId);

    const res = await agent
      .post("/notes")
      .set(authHeader(other.token))
      .send({
        noteBookId: book.id,
        title: "越权",
        content: "不应成功",
      })
      .expect(404);

    expect(res.body.code).toBe(ErrorCodes.NOTEBOOK_NOT_FOUND);
  });

  it("GET /notes 列表分页", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    await seedNote({ userId, noteBookId: book.id, title: "第一篇" });
    await seedNote({ userId, noteBookId: book.id, title: "第二篇" });

    const res = await agent
      .get("/notes")
      .query({ page: 1, limit: 10, noteBookId: book.id })
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items).toHaveLength(2);
  });

  it("DELETE /notes/:id 软删后 trash 可见", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    await agent
      .delete(`/notes/${note.id}`)
      .set(authHeader(token))
      .expect(200);

    const listRes = await agent
      .get("/notes")
      .set(authHeader(token))
      .expect(200);
    expect(listRes.body.data.total).toBe(0);

    const trashRes = await agent
      .get("/notes/trash")
      .set(authHeader(token))
      .expect(200);
    expect(trashRes.body.data.total).toBe(1);
    expect(trashRes.body.data.items[0].id).toBe(note.id);
  });

  it("POST /notes/:id/restore 恢复手帐", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    await agent.delete(`/notes/${note.id}`).set(authHeader(token));

    const res = await agent
      .post(`/notes/${note.id}/restore`)
      .set(authHeader(token))
      .send({})
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.note.id).toBe(note.id);

    const listRes = await agent
      .get("/notes")
      .set(authHeader(token))
      .expect(200);
    expect(listRes.body.data.total).toBe(1);
  });

  it("DELETE /notes/:id/purge 彻底删除", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    await agent.delete(`/notes/${note.id}`).set(authHeader(token));

    await agent
      .delete(`/notes/${note.id}/purge`)
      .set(authHeader(token))
      .expect(200);

    const trashRes = await agent
      .get("/notes/trash")
      .set(authHeader(token))
      .expect(200);
    expect(trashRes.body.data.total).toBe(0);
  });

  it("PUT /notes/:id 跨用户更新返回 404", async () => {
    const owner = await createAuthUser({ userId: "upd-owner" });
    const other = await createAuthUser({ userId: "upd-other" });
    const book = await seedNoteBook(owner.userId);
    const note = await seedNote({ userId: owner.userId, noteBookId: book.id });

    const res = await agent
      .put(`/notes/${note.id}`)
      .set(authHeader(other.token))
      .send({ title: "黑客改标题" })
      .expect(404);

    expect(res.body.code).toBe(ErrorCodes.NOTE_NOT_FOUND);
  });

  it("GET /notes/:id 默认含 readingStyleKey null", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    const res = await agent
      .get(`/notes/${note.id}`)
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.readingStyleKey).toBeNull();
    expect(res.body.data.readingThemeId).toBeNull();
    expect(res.body.data.readingThemeScope).toBeUndefined();
  });

  it("PUT /notes/:id 可写入合法 readingStyleKey 并回读", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });
    const keys = [
      "journal",
      "minimalNordic",
      "vintageJournal",
      "watercolorSketch",
      "dreamyCinematic",
      "productMemo",
    ] as const;

    for (const readingStyleKey of keys) {
      const putRes = await agent
        .put(`/notes/${note.id}`)
        .set(authHeader(token))
        .send({ readingStyleKey })
        .expect(200);

      expect(putRes.body.code).toBe(0);
      expect(putRes.body.data.readingStyleKey).toBe(readingStyleKey);

      const getRes = await agent
        .get(`/notes/${note.id}`)
        .set(authHeader(token))
        .expect(200);

      expect(getRes.body.data.readingStyleKey).toBe(readingStyleKey);
    }
  });

  it("PUT /notes/:id readingStyleKey null 恢复标准阅读", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    await agent
      .put(`/notes/${note.id}`)
      .set(authHeader(token))
      .send({ readingStyleKey: "journal" })
      .expect(200);

    const res = await agent
      .put(`/notes/${note.id}`)
      .set(authHeader(token))
      .send({ readingStyleKey: null })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.readingStyleKey).toBeNull();
  });

  it("PUT /notes/:id 非法 readingStyleKey 返回 400", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    const res = await agent
      .put(`/notes/${note.id}`)
      .set(authHeader(token))
      .send({ readingStyleKey: "invalid-style" })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("PUT /notes/:id 导出专用 readingStyleKey 返回 400", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    const res = await agent
      .put(`/notes/${note.id}`)
      .set(authHeader(token))
      .send({ readingStyleKey: "filmTravel" })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("PUT /notes/:id 可写入 readingThemeId 并回读", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    const putRes = await agent
      .put(`/notes/${note.id}`)
      .set(authHeader(token))
      .send({
        readingStyleKey: "vintageJournal",
        readingThemeId: "vintage-rose",
      })
      .expect(200);

    expect(putRes.body.data.readingStyleKey).toBe("vintageJournal");
    expect(putRes.body.data.readingThemeId).toBe("vintage-rose");

    const getRes = await agent
      .get(`/notes/${note.id}`)
      .set(authHeader(token))
      .expect(200);

    expect(getRes.body.data.readingThemeId).toBe("vintage-rose");
  });

  it("PUT /notes/:id readingStyleKey null 时清空 readingThemeId", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    await agent
      .put(`/notes/${note.id}`)
      .set(authHeader(token))
      .send({
        readingStyleKey: "journal",
        readingThemeId: "vintage_paper",
      })
      .expect(200);

    const res = await agent
      .put(`/notes/${note.id}`)
      .set(authHeader(token))
      .send({ readingStyleKey: null })
      .expect(200);

    expect(res.body.data.readingStyleKey).toBeNull();
    expect(res.body.data.readingThemeId).toBeNull();
  });

  it("PUT /notes/:id 系统已隐藏 readingThemeId 返回 400", async () => {
    const { token: adminToken } = await seedAdmin();
    const defaults = buildDefaultReadingThemeCatalog();
    await agent
      .put("/admin/reading-theme-catalog")
      .set(adminAuthHeader(adminToken))
      .send({
        styleKeys: [null, "vintageJournal"],
        themeIdsByStyle: {
          vintageJournal: defaults.themeIdsByStyle.vintageJournal.filter(
            (id) => id !== "vintage-rose",
          ),
        },
      })
      .expect(200);

    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    const res = await agent
      .put(`/notes/${note.id}`)
      .set(authHeader(token))
      .send({
        readingStyleKey: "vintageJournal",
        readingThemeId: "vintage-rose",
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("GET /notes/search/page 分页深度超限返回 400", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .get("/notes/search/page")
      .query({ q: "日记", page: 1001, limit: 10 })
      .set(authHeader(token))
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("GET /notes page*limit 超限返回 400", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .get("/notes")
      .query({ page: 1001, limit: 10 })
      .set(authHeader(token))
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });
});
