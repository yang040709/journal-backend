import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { authHeader, createAuthUser } from "../../helpers/authFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedNote } from "../../helpers/seed/note.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import Note from "../../../src/model/Note";
import { ErrorCodes } from "../../../src/utils/response";

describe("integration: /notes/trash", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("GET /notes/trash 无 token 返回 401", async () => {
    await agent.get("/notes/trash").expect(401);
  });

  it("GET /notes/trash 空列表", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .get("/notes/trash")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.items).toHaveLength(0);
  });

  it("GET /notes/trash page*limit 超限返回 400", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .get("/notes/trash")
      .query({ page: 1001, limit: 10 })
      .set(authHeader(token))
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("GET /notes/:id/trash-detail 软删后可读", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id, title: "废纸篓详情" });

    await agent.delete(`/notes/${note.id}`).set(authHeader(token)).expect(200);

    const res = await agent
      .get(`/notes/${note.id}/trash-detail`)
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.id).toBe(note.id);
    expect(res.body.data.title).toBe("废纸篓详情");
  });

  it("GET /notes/:id/trash-detail 未软删返回 404", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    const res = await agent
      .get(`/notes/${note.id}/trash-detail`)
      .set(authHeader(token))
      .expect(404);

    expect(res.body.code).toBe(ErrorCodes.NOTE_NOT_FOUND);
  });

  it("GET /notes/:id/trash-detail 已 purge 返回 404", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    await agent.delete(`/notes/${note.id}`).set(authHeader(token));
    await agent.delete(`/notes/${note.id}/purge`).set(authHeader(token)).expect(200);

    const res = await agent
      .get(`/notes/${note.id}/trash-detail`)
      .set(authHeader(token))
      .expect(404);

    expect(res.body.code).toBe(ErrorCodes.NOTE_NOT_FOUND);
  });

  it("跨用户 trash-detail / restore / purge 返回 404", async () => {
    const owner = await createAuthUser({ userId: "trash-owner" });
    const other = await createAuthUser({ userId: "trash-other" });
    const book = await seedNoteBook(owner.userId);
    const note = await seedNote({ userId: owner.userId, noteBookId: book.id });

    await agent.delete(`/notes/${note.id}`).set(authHeader(owner.token));

    const detailRes = await agent
      .get(`/notes/${note.id}/trash-detail`)
      .set(authHeader(other.token))
      .expect(404);
    expect(detailRes.body.code).toBe(ErrorCodes.NOTE_NOT_FOUND);

    const restoreRes = await agent
      .post(`/notes/${note.id}/restore`)
      .set(authHeader(other.token))
      .send({})
      .expect(404);
    expect(restoreRes.body.code).toBe(ErrorCodes.NOTE_NOT_FOUND);

    const purgeRes = await agent
      .delete(`/notes/${note.id}/purge`)
      .set(authHeader(other.token))
      .expect(404);
    expect(purgeRes.body.code).toBe(ErrorCodes.NOTE_NOT_FOUND);
  });

  it("POST /notes/:id/restore 指定 targetNoteBookId 恢复到目标本", async () => {
    const { token, userId } = await createAuthUser();
    const sourceBook = await seedNoteBook(userId, "来源本");
    const targetBook = await seedNoteBook(userId, "目标本");
    const note = await seedNote({ userId, noteBookId: sourceBook.id });

    await agent.delete(`/notes/${note.id}`).set(authHeader(token));

    const res = await agent
      .post(`/notes/${note.id}/restore`)
      .set(authHeader(token))
      .send({ targetNoteBookId: targetBook.id })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.restoredToNoteBookId).toBe(targetBook.id);
    expect(res.body.data.restoredToNoteBookTitle).toBe("目标本");
    expect(res.body.data.note.noteBookId).toBe(targetBook.id);
  });

  it("POST /notes/:id/restore 不刷新手帐 updatedAt", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const past = new Date("2020-01-15T08:00:00.000Z");
    const note = await seedNote({ userId, noteBookId: book.id });

    await Note.updateOne(
      { _id: note.id },
      { $set: { updatedAt: past } },
      { timestamps: false },
    );

    await agent.delete(`/notes/${note.id}`).set(authHeader(token));

    await agent
      .post(`/notes/${note.id}/restore`)
      .set(authHeader(token))
      .send({})
      .expect(200);

    const refreshed = await Note.findById(note.id).lean();
    expect(refreshed?.isDeleted).toBe(false);
    expect(refreshed?.updatedAt?.toISOString()).toBe(past.toISOString());
  });

  it("POST /notes/:id/restore 指定已删手帐本返回 404", async () => {
    const { token, userId } = await createAuthUser();
    const sourceBook = await seedNoteBook(userId);
    const deletedBook = await seedNoteBook(userId, "已删本", { isDeleted: true });
    const note = await seedNote({ userId, noteBookId: sourceBook.id });

    await agent.delete(`/notes/${note.id}`).set(authHeader(token));

    const res = await agent
      .post(`/notes/${note.id}/restore`)
      .set(authHeader(token))
      .send({ targetNoteBookId: deletedBook.id })
      .expect(404);

    expect(res.body.code).toBe(ErrorCodes.NOTEBOOK_NOT_FOUND);
  });

  it("purge / restore 对未在 trash 的 note 返回 404", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });

    const restoreRes = await agent
      .post(`/notes/${note.id}/restore`)
      .set(authHeader(token))
      .send({})
      .expect(404);
    expect(restoreRes.body.code).toBe(ErrorCodes.NOTE_NOT_FOUND);

    const purgeRes = await agent
      .delete(`/notes/${note.id}/purge`)
      .set(authHeader(token))
      .expect(404);
    expect(purgeRes.body.code).toBe(ErrorCodes.NOTE_NOT_FOUND);
  });

  it("POST /notes/:id/restore 原手帐本已删时 fallback 到另一本", async () => {
    const { token, userId } = await createAuthUser();
    const deletedBook = await seedNoteBook(userId, "已删原本", { isDeleted: true });
    const fallbackBook = await seedNoteBook(userId, "备用本");
    const note = await seedNote({
      userId,
      noteBookId: deletedBook.id,
      isDeleted: true,
    });

    const res = await agent
      .post(`/notes/${note.id}/restore`)
      .set(authHeader(token))
      .send({})
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.restoredToNoteBookId).toBe(fallbackBook.id);
    expect(res.body.data.restoredToNoteBookTitle).toBe("备用本");
  });
});
