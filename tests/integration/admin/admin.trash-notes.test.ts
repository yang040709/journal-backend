import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import {
  adminAuthHeader,
  seedAdmin,
  seedLimitedAdmin,
  seedNotesAdmin,
} from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedNote } from "../../helpers/seed/note.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedUser } from "../../helpers/seed/user.seed";
import Note from "../../../src/model/Note";
import { ErrorCodes } from "../../../src/utils/response";

describe("integration: admin trash notes", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("有 notes 权限的 admin GET /admin/notes/trash 成功", async () => {
    const { token } = await seedNotesAdmin();
    const { userId } = await seedUser();
    const book = await seedNoteBook(userId);
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "软删手帐",
      isDeleted: true,
    });

    const res = await agent
      .get("/admin/notes/trash")
      .query({ page: 1, limit: 10 })
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].title).toBe("软删手帐");
  });

  it("无 notes 权限的 admin GET /admin/notes/trash 返回 403", async () => {
    const { token } = await seedLimitedAdmin();

    const res = await agent
      .get("/admin/notes/trash")
      .query({ page: 1, limit: 10 })
      .set(adminAuthHeader(token))
      .expect(403);

    expect(res.body.code).toBe(ErrorCodes.PERMISSION_ERROR);
  });

  it("默认列表不含已过期软删手帐", async () => {
    const { token } = await seedNotesAdmin();
    const { userId } = await seedUser();
    const book = await seedNoteBook(userId);
    const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "已过期",
      isDeleted: true,
      deletedAt: expiredAt,
      deleteExpireAt: new Date(Date.now() - 1000),
    });
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "未过期",
      isDeleted: true,
    });

    const res = await agent
      .get("/admin/notes/trash")
      .query({ page: 1, limit: 10 })
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].title).toBe("未过期");
  });

  it("includeExpired=true 含已过期软删手帐", async () => {
    const { token } = await seedNotesAdmin();
    const { userId } = await seedUser();
    const book = await seedNoteBook(userId);
    const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "已过期",
      isDeleted: true,
      deletedAt: expiredAt,
      deleteExpireAt: new Date(Date.now() - 1000),
    });
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "未过期",
      isDeleted: true,
    });

    const res = await agent
      .get("/admin/notes/trash")
      .query({ page: 1, limit: 10, includeExpired: true })
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.data.total).toBe(2);
  });

  it("userId 筛选", async () => {
    const { token } = await seedNotesAdmin();
    const userA = await seedUser();
    const userB = await seedUser();
    const bookA = await seedNoteBook(userA.userId);
    const bookB = await seedNoteBook(userB.userId);
    await seedNote({
      userId: userA.userId,
      noteBookId: bookA.id,
      title: "A 的手帐",
      isDeleted: true,
    });
    await seedNote({
      userId: userB.userId,
      noteBookId: bookB.id,
      title: "B 的手帐",
      isDeleted: true,
    });

    const res = await agent
      .get("/admin/notes/trash")
      .query({ page: 1, limit: 10, userId: userA.userId })
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].title).toBe("A 的手帐");
  });

  it("软删手帐不出现在 GET /admin/notes 列表", async () => {
    const { token } = await seedNotesAdmin();
    const { userId } = await seedUser();
    const book = await seedNoteBook(userId);
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "软删",
      isDeleted: true,
    });
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "正常",
    });

    const res = await agent
      .get("/admin/notes")
      .query({ page: 1, limit: 10 })
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].title).toBe("正常");
  });

  it("POST /admin/notes/trash/:id/restore 恢复成功", async () => {
    const { token } = await seedNotesAdmin();
    const { userId } = await seedUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "待恢复",
      isDeleted: true,
    });

    const res = await agent
      .post(`/admin/notes/trash/${note.id}/restore`)
      .set(adminAuthHeader(token))
      .send({})
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.restoredToNoteBookId).toBe(book.id);

    const doc = await Note.findById(note.id);
    expect(doc?.isDeleted).toBe(false);
    expect(doc?.deletedAt).toBeNull();
    expect(doc?.deleteExpireAt).toBeNull();
  });

  it("DELETE /admin/notes/trash/:id/purge 需 super-admin", async () => {
    const { token: notesToken } = await seedNotesAdmin();
    const { token: superToken } = await seedAdmin();
    const { userId } = await seedUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "待永久删除",
      isDeleted: true,
    });

    const forbidden = await agent
      .delete(`/admin/notes/trash/${note.id}/purge`)
      .set(adminAuthHeader(notesToken))
      .expect(403);
    expect(forbidden.body.code).toBe(ErrorCodes.PERMISSION_ERROR);

    const res = await agent
      .delete(`/admin/notes/trash/${note.id}/purge`)
      .set(adminAuthHeader(superToken))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.deleted).toBe(true);

    const doc = await Note.findById(note.id);
    expect(doc).toBeNull();
  });

  it("GET /admin/notes/trash/:id 返回详情", async () => {
    const { token } = await seedNotesAdmin();
    const { userId } = await seedUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "详情手帐",
      content: "废纸篓正文",
      isDeleted: true,
    });

    const res = await agent
      .get(`/admin/notes/trash/${note.id}`)
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.title).toBe("详情手帐");
    expect(res.body.data.content).toBe("废纸篓正文");
  });

  it("软删手帐 GET /admin/notes/:id 返回 404", async () => {
    const { token } = await seedNotesAdmin();
    const { userId } = await seedUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "不可直接查看",
      isDeleted: true,
    });

    const res = await agent
      .get(`/admin/notes/${note.id}`)
      .set(adminAuthHeader(token))
      .expect(404);

    expect(res.body.code).toBe(ErrorCodes.NOTE_NOT_FOUND);
  });

  it("软删手帐 DELETE /admin/notes/:id 拒绝并提示走废纸篓", async () => {
    const { token } = await seedNotesAdmin();
    const { userId } = await seedUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "不可直接删",
      isDeleted: true,
    });

    const res = await agent
      .delete(`/admin/notes/${note.id}`)
      .set(adminAuthHeader(token))
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
    expect(res.body.message).toContain("废纸篓");

    const doc = await Note.findById(note.id);
    expect(doc?.isDeleted).toBe(true);
  });

  it("GET /admin/notes/trash/expired-count 返回已过期数量", async () => {
    const { token: superToken } = await seedAdmin();
    const { userId } = await seedUser();
    const book = await seedNoteBook(userId);
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "已过期",
      isDeleted: true,
      deleteExpireAt: new Date(Date.now() - 1000),
    });
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "未过期",
      isDeleted: true,
    });

    const res = await agent
      .get("/admin/notes/trash/expired-count")
      .set(adminAuthHeader(superToken))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.count).toBe(1);
  });

  it("POST /admin/notes/trash/purge-expired 批量删除已过期手帐", async () => {
    const { token: superToken } = await seedAdmin();
    const { token: notesToken } = await seedNotesAdmin();
    const { userId } = await seedUser();
    const book = await seedNoteBook(userId);
    const expired = await seedNote({
      userId,
      noteBookId: book.id,
      title: "待批量删",
      isDeleted: true,
      deleteExpireAt: new Date(Date.now() - 1000),
    });
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "保留",
      isDeleted: true,
    });

    const forbidden = await agent
      .post("/admin/notes/trash/purge-expired")
      .set(adminAuthHeader(notesToken))
      .expect(403);
    expect(forbidden.body.code).toBe(ErrorCodes.PERMISSION_ERROR);

    const res = await agent
      .post("/admin/notes/trash/purge-expired")
      .set(adminAuthHeader(superToken))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.purged).toBe(1);
    expect(res.body.data.total).toBe(1);

    expect(await Note.findById(expired.id)).toBeNull();
    const remaining = await Note.find({ userId, isDeleted: true });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.title).toBe("保留");
  });
});
