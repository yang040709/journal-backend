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
import Note from "../../../src/model/Note";
import { ErrorCodes } from "../../../src/utils/response";

describe("integration: /export", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("GET /export/data 无 token 返回 401", async () => {
    await agent.get("/export/data").expect(401);
  });

  it("GET /export/data 返回用户备份数据", async () => {
    const { token, userId } = await createAuthUser();
    const nb = await seedNoteBook(userId);
    await Note.create({
      noteBookId: nb.id,
      userId,
      title: "备份手帐",
      content: "正文",
      tags: [],
    });

    const res = await agent
      .get("/export/data")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.statistics.noteCount).toBe(1);
    expect(res.headers["content-disposition"]).toContain("attachment");
  });

  it("POST /export/import 参数校验失败返回 400", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .post("/export/import")
      .set(authHeader(token))
      .send({
        data: {
          noteBooks: [{ title: "" }],
          notes: [],
        },
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
    expect(res.body.message).toBe("参数验证失败");
  });

  it("POST /export/import 缺少 noteBookId 返回 400", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .post("/export/import")
      .set(authHeader(token))
      .send({
        data: {
          noteBooks: [{ title: "导入本" }],
          notes: [{ title: "无本", content: "x" }],
        },
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });
});
