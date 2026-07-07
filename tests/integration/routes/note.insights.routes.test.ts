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
import { fixedUtcDate, seedNote } from "../../helpers/seed/note.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { ErrorCodes } from "../../../src/utils/response";

describe("integration: /notes/insights", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("GET /notes/on-this-day 无 token 返回 401", async () => {
    await agent.get("/notes/on-this-day").expect(401);
  });

  it("GET /notes/on-this-day 跨年同月日聚合", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);

    await seedNote({
      userId,
      noteBookId: book.id,
      title: "2024 年的今天",
      createdAt: fixedUtcDate(2024, 7, 5),
    });
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "2025 年的今天",
      createdAt: fixedUtcDate(2025, 7, 5),
    });

    const res = await agent
      .get("/notes/on-this-day")
      .query({ month: 7, day: 5, tz: "UTC" })
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.totalMatched).toBe(2);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.truncated).toBe(false);
    expect(res.body.data.groups).toHaveLength(2);
    expect(res.body.data.groups[0].year).toBe(2025);
    expect(res.body.data.groups[1].year).toBe(2024);
    expect(res.body.data.groups[0].yearsAgo).toBeLessThan(
      res.body.data.groups[1].yearsAgo,
    );
  });

  it("GET /notes/on-this-day 软删笔记不出现", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);

    await seedNote({
      userId,
      noteBookId: book.id,
      title: "正常",
      createdAt: fixedUtcDate(2024, 7, 5),
    });
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "已删",
      createdAt: fixedUtcDate(2023, 7, 5),
      isDeleted: true,
    });

    const res = await agent
      .get("/notes/on-this-day")
      .query({ month: 7, day: 5, tz: "UTC" })
      .set(authHeader(token))
      .expect(200);

    expect(res.body.data.totalMatched).toBe(1);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].items[0].title).toBe("正常");
  });

  it("GET /notes/on-this-day 响应不含 content", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);

    await seedNote({
      userId,
      noteBookId: book.id,
      content: "不应出现在响应里",
      createdAt: fixedUtcDate(2024, 7, 5),
    });

    const res = await agent
      .get("/notes/on-this-day")
      .query({ month: 7, day: 5, tz: "UTC", limit: 10 })
      .set(authHeader(token))
      .expect(200);

    const item = res.body.data.groups[0]?.items[0];
    expect(item).toBeDefined();
    expect(item.content).toBeUndefined();
  });

  it("GET /notes/on-this-day limit 截断", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);

    for (let i = 0; i < 3; i += 1) {
      await seedNote({
        userId,
        noteBookId: book.id,
        title: `第 ${i + 1} 篇`,
        createdAt: fixedUtcDate(2020 + i, 7, 5),
      });
    }

    const res = await agent
      .get("/notes/on-this-day")
      .query({ month: 7, day: 5, tz: "UTC", limit: 2 })
      .set(authHeader(token))
      .expect(200);

    expect(res.body.data.totalMatched).toBe(3);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.truncated).toBe(true);
  });

  it("GET /notes/on-this-day 非法 month/day 返回空结果", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    await seedNote({
      userId,
      noteBookId: book.id,
      createdAt: fixedUtcDate(2024, 2, 29),
    });

    const res = await agent
      .get("/notes/on-this-day")
      .query({ month: 2, day: 30, tz: "UTC" })
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.totalMatched).toBe(0);
    expect(res.body.data.groups).toHaveLength(0);
  });

  it("GET /notes/calendar/daily-counts 缺参返回 400", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .get("/notes/calendar/daily-counts")
      .set(authHeader(token))
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("GET /notes/calendar/daily-counts 按日统计", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);

    await seedNote({
      userId,
      noteBookId: book.id,
      createdAt: fixedUtcDate(2024, 7, 1),
    });
    await seedNote({
      userId,
      noteBookId: book.id,
      createdAt: fixedUtcDate(2024, 7, 1),
    });
    await seedNote({
      userId,
      noteBookId: book.id,
      createdAt: fixedUtcDate(2024, 7, 2),
    });

    const startTime = fixedUtcDate(2024, 7, 1).getTime();
    const endTime = fixedUtcDate(2024, 7, 3).getTime();

    const res = await agent
      .get("/notes/calendar/daily-counts")
      .query({ startTime, endTime, tz: "UTC" })
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.tz).toBe("UTC");
    expect(res.body.data.days).toEqual(
      expect.arrayContaining([
        { date: "2024-07-01", count: 2 },
        { date: "2024-07-02", count: 1 },
      ]),
    );
    expect(res.body.data.maxCount).toBe(2);
  });
});
