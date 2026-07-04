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
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { ErrorCodes } from "../../../src/utils/response";

describe("integration: /note-books", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("GET /note-books 无 token 返回 401", async () => {
    await agent.get("/note-books").expect(401);
  });

  it("GET /note-books 空列表", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .get("/note-books")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });

  it("POST /note-books 创建手帐本", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .post("/note-books")
      .set(authHeader(token))
      .send({ title: "我的日记" })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.title).toBe("我的日记");
    expect(res.body.data.id).toBeTruthy();
  });

  it("POST /note-books 标题为空返回 400", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .post("/note-books")
      .set(authHeader(token))
      .send({ title: "" })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("PUT /note-books/:id 跨用户访问返回 404", async () => {
    const owner = await createAuthUser({ userId: "owner-a" });
    const other = await createAuthUser({ userId: "owner-b" });
    const book = await seedNoteBook(owner.userId, "私密本");

    const res = await agent
      .put(`/note-books/${book.id}`)
      .set(authHeader(other.token))
      .send({ title: "篡改标题" })
      .expect(404);

    expect(res.body.code).toBe(ErrorCodes.NOTEBOOK_NOT_FOUND);
  });

  it("DELETE /note-books/:id 删除后 GET 404", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId, "待删本");

    await agent
      .delete(`/note-books/${book.id}`)
      .set(authHeader(token))
      .expect(200);

    const res = await agent
      .get(`/note-books/${book.id}`)
      .set(authHeader(token))
      .expect(404);

    expect(res.body.code).toBe(ErrorCodes.NOTEBOOK_NOT_FOUND);
  });

  it("GET /note-books/:id 可获取自己的手帐本", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId, "可读本");

    const res = await agent
      .get(`/note-books/${book.id}`)
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.title).toBe("可读本");
  });
});
