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
import { MAX_CUSTOM_NOTE_TAGS } from "../../../src/service/userNoteCustomTag.service";

describe("integration: /notes/tags", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("GET /notes/preset-tags 无 token 返回 401", async () => {
    await agent.get("/notes/preset-tags").expect(401);
  });

  it("GET /notes/preset-tags 首次返回系统 seed", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .get("/notes/preset-tags")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.systemTags).toContain("日常");
    expect(res.body.data.customTags).toEqual([]);
    expect(res.body.data.tags).toEqual(res.body.data.systemTags);
  });

  it("GET /notes/preset-tags?q=心 按关键字过滤", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .get("/notes/preset-tags")
      .query({ q: "心" })
      .set(authHeader(token))
      .expect(200);

    expect(res.body.data.tags).toContain("心情");
    expect(res.body.data.systemTags).toContain("心情");
    expect(res.body.data.tags).not.toContain("日常");
  });

  it("POST /notes/custom-tags 新增自定义标签", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .post("/notes/custom-tags")
      .set(authHeader(token))
      .send({ name: "我的标签" })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.customTags).toContain("我的标签");
    expect(res.body.data.tags).toContain("我的标签");
    expect(res.body.data.tags).toContain("日常");
  });

  it("POST /notes/custom-tags 与系统标签同名返回 400", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .post("/notes/custom-tags")
      .set(authHeader(token))
      .send({ name: "日常" })
      .expect(400);

    expect(res.body.message).toContain("不能与系统标签同名");
  });

  it("POST /notes/custom-tags 重复添加返回 400", async () => {
    const { token } = await createAuthUser();

    await agent
      .post("/notes/custom-tags")
      .set(authHeader(token))
      .send({ name: "重复标签" })
      .expect(200);

    const res = await agent
      .post("/notes/custom-tags")
      .set(authHeader(token))
      .send({ name: "重复标签" })
      .expect(400);

    expect(res.body.message).toContain("该标签已存在");
  });

  it(`POST /notes/custom-tags 超过 ${MAX_CUSTOM_NOTE_TAGS} 个返回 400`, async () => {
    const { token } = await createAuthUser();

    for (let i = 1; i <= MAX_CUSTOM_NOTE_TAGS; i += 1) {
      await agent
        .post("/notes/custom-tags")
        .set(authHeader(token))
        .send({ name: `标签${i}` })
        .expect(200);
    }

    const res = await agent
      .post("/notes/custom-tags")
      .set(authHeader(token))
      .send({ name: "超出上限" })
      .expect(400);

    expect(res.body.message).toContain(`自定义标签最多 ${MAX_CUSTOM_NOTE_TAGS} 个`);
  });

  it("DELETE /notes/custom-tags 删除自定义标签", async () => {
    const { token } = await createAuthUser();

    await agent
      .post("/notes/custom-tags")
      .set(authHeader(token))
      .send({ name: "待删标签" })
      .expect(200);

    const res = await agent
      .delete("/notes/custom-tags")
      .query({ name: "待删标签" })
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.customTags).not.toContain("待删标签");
    expect(res.body.data.tags).not.toContain("待删标签");
  });

  it("DELETE /notes/custom-tags 删除不存在的标签返回 400", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .delete("/notes/custom-tags")
      .query({ name: "不存在" })
      .set(authHeader(token))
      .expect(400);

    expect(res.body.message).toContain("未找到该标签");
  });

  it("自定义标签用户隔离", async () => {
    const userA = await createAuthUser({ userId: "tag-user-a" });
    const userB = await createAuthUser({ userId: "tag-user-b" });

    await agent
      .post("/notes/custom-tags")
      .set(authHeader(userA.token))
      .send({ name: "A 专属" })
      .expect(200);

    const res = await agent
      .get("/notes/preset-tags")
      .set(authHeader(userB.token))
      .expect(200);

    expect(res.body.data.customTags).not.toContain("A 专属");
    expect(res.body.data.tags).not.toContain("A 专属");
  });
});
