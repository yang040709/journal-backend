import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import {
  adminAuthHeader,
  seedAdmin,
  seedNotesAdmin,
} from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { ErrorCodes } from "../../../src/utils/response";
import Activity from "../../../src/model/Activity";
import { ADMIN_PAGE_USERS } from "../../../src/constant/adminPages";

async function seedActivity(
  overrides: Partial<{
    type: "create" | "update" | "delete" | "share_enable" | "session";
    target: "note" | "noteBook" | "user";
    targetId: string;
    title: string;
    userId: string;
    createdAt: Date;
  }> = {},
) {
  await Activity.create({
    type: overrides.type ?? "create",
    target: overrides.target ?? "note",
    targetId: overrides.targetId ?? `target_${Date.now()}_${Math.random()}`,
    title: overrides.title ?? "测试活动",
    userId: overrides.userId ?? "user-1",
    createdAt: overrides.createdAt ?? new Date(),
  });
}

describe("integration: admin activity type summary", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("GET /admin/activity/summary?days=7 返回 create/update/delete 聚合", async () => {
    const { token } = await seedAdmin();
    const now = Date.now();

    await seedActivity({ type: "create", userId: "user-1" });
    await seedActivity({ type: "create", userId: "user-2" });
    await seedActivity({ type: "update", userId: "user-1" });
    await seedActivity({ type: "delete", userId: "user-1" });
    await seedActivity({
      type: "share_enable",
      userId: "user-1",
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    });
    await seedActivity({
      type: "create",
      userId: "user-1",
      createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
    });

    const res = await agent
      .get("/admin/activity/summary?days=7")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.days).toBe(7);
    expect(res.body.data.counts).toEqual({
      create: 2,
      update: 1,
      delete: 1,
    });
    expect(res.body.data.total).toBe(4);
    expect(res.body.data.rangeStart).toBeTruthy();
    expect(res.body.data.rangeEnd).toBeTruthy();
  });

  it("支持 userId 与 target 筛选", async () => {
    const { token } = await seedAdmin();

    await seedActivity({ type: "create", userId: "user-a", target: "note" });
    await seedActivity({ type: "update", userId: "user-a", target: "noteBook" });
    await seedActivity({ type: "delete", userId: "user-b", target: "note" });

    const byUser = await agent
      .get("/admin/activity/summary?days=7&userId=user-a")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(byUser.body.data.counts).toEqual({
      create: 1,
      update: 1,
      delete: 0,
    });

    const byTarget = await agent
      .get("/admin/activity/summary?days=7&target=note")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(byTarget.body.data.counts).toEqual({
      create: 1,
      update: 0,
      delete: 1,
    });
  });

  it("days=30 可用，days=14 返回 400", async () => {
    const { token } = await seedAdmin();

    const ok = await agent
      .get("/admin/activity/summary?days=30")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(ok.body.data.days).toBe(30);

    const bad = await agent
      .get("/admin/activity/summary?days=14")
      .set(adminAuthHeader(token))
      .expect(400);

    expect(bad.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("无 users 页面权限的 admin 返回 403", async () => {
    const { token } = await seedNotesAdmin();

    const res = await agent
      .get("/admin/activity/summary?days=7")
      .set(adminAuthHeader(token))
      .expect(403);

    expect(res.body.code).toBe(ErrorCodes.PERMISSION_ERROR);
  });

  it("有 users 页面权限的 admin 可访问", async () => {
    const { token } = await seedAdmin({
      username: "users-admin",
      password: "users-admin-pass",
      role: "admin",
      allowedPages: [ADMIN_PAGE_USERS],
    });

    const res = await agent
      .get("/admin/activity/summary?days=7")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.counts).toEqual({
      create: 0,
      update: 0,
      delete: 0,
    });
  });
});
