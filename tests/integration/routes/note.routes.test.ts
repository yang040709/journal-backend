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
import Note from "../../../src/model/Note";
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

  it("GET /notes 列表返回 contentPreview 且不返回 content", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "我是小羊",
      content: "今天天气很好，和小羊一起去公园玩",
    });

    const res = await agent
      .get("/notes")
      .query({ page: 1, limit: 10, noteBookId: book.id })
      .set(authHeader(token))
      .expect(200);

    const item = res.body.data.items[0];
    expect(item.contentPreview).toContain("今天天气很好");
    expect(item.content).toBeUndefined();
  });

  it("GET /notes 补全缺失 contentPreview 时不更新 updatedAt", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const past = new Date("2020-01-15T08:00:00.000Z");

    const doc = await Note.create({
      userId,
      noteBookId: book.id,
      title: "旧数据",
      content: "这是存量手帐正文",
      tags: [],
      images: [],
      isShare: false,
      shareId: "testshare1234",
      shareVersion: 0,
      isDeleted: false,
      createdAt: past,
      updatedAt: past,
    });
    await Note.updateOne(
      { _id: doc._id },
      { $set: { contentPreview: "" } },
      { timestamps: false },
    );

    await agent
      .get("/notes")
      .query({ page: 1, limit: 10, noteBookId: book.id })
      .set(authHeader(token))
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const refreshed = await Note.findById(doc._id).lean();
    expect(refreshed?.contentPreview).toContain("这是存量手帐正文");
    expect(refreshed?.updatedAt?.toISOString()).toBe(past.toISOString());
  });

  it("GET /notes 重复请求不刷新已有 contentPreview 手帐的 updatedAt", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const past = new Date("2020-01-15T08:00:00.000Z");

    const doc = await Note.create({
      userId,
      noteBookId: book.id,
      title: "已有摘要",
      content: "第一行\n第二行",
      tags: [],
      images: [],
      isShare: false,
      shareId: "testshare5678",
      shareVersion: 0,
      isDeleted: false,
      createdAt: past,
      updatedAt: past,
    });
    await Note.updateOne(
      { _id: doc._id },
      { $set: { contentPreview: "旧摘要" } },
      { timestamps: false },
    );

    await agent
      .get("/notes")
      .query({ page: 1, limit: 10, noteBookId: book.id })
      .set(authHeader(token))
      .expect(200);
    await agent
      .get("/notes")
      .query({ page: 1, limit: 10, noteBookId: book.id })
      .set(authHeader(token))
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const refreshed = await Note.findById(doc._id).lean();
    expect(refreshed?.contentPreview).toBe("旧摘要");
    expect(refreshed?.updatedAt?.toISOString()).toBe(past.toISOString());
  });

  it("POST /notes 创建时写入 contentPreview", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);

    const res = await agent
      .post("/notes")
      .set(authHeader(token))
      .send({
        noteBookId: book.id,
        title: "今日心情",
        content: "阳光很好，适合写手帐",
        tags: [],
      })
      .expect(200);

    expect(res.body.data.contentPreview).toContain("阳光很好");
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

  it("PUT /notes/:id 可写入 filmTravel readingStyleKey 并回读", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    const putRes = await agent
      .put(`/notes/${note.id}`)
      .set(authHeader(token))
      .send({
        readingStyleKey: "filmTravel",
        readingThemeId: "film-default",
      })
      .expect(200);

    expect(putRes.body.data.readingStyleKey).toBe("filmTravel");
    expect(putRes.body.data.readingThemeId).toBe("film-default");

    const getRes = await agent
      .get(`/notes/${note.id}`)
      .set(authHeader(token))
      .expect(200);

    expect(getRes.body.data.readingStyleKey).toBe("filmTravel");
    expect(getRes.body.data.readingThemeId).toBe("film-default");
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
