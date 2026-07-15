import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { adminAuthHeader, seedAdmin } from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";

/** list/create catch 多数字段无显式 status，默认 400 */
const expectClientErr = (status: number) => {
  expect(status).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
};

vi.mock("../../../src/service/adminTemplate.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/adminTemplate.service")>();
  const S = actual.AdminTemplateService;
  return {
    ...actual,
    AdminTemplateService: {
      listTemplates: vi.fn(S.listTemplates.bind(S)),
      listSystemTemplates: vi.fn(S.listSystemTemplates.bind(S)),
      createTemplate: vi.fn(S.createTemplate.bind(S)),
      createSystemTemplate: vi.fn(S.createSystemTemplate.bind(S)),
      getTemplateById: vi.fn(S.getTemplateById.bind(S)),
      updateTemplate: vi.fn(S.updateTemplate.bind(S)),
      updateSystemTemplate: vi.fn(S.updateSystemTemplate.bind(S)),
      deleteTemplate: vi.fn(S.deleteTemplate.bind(S)),
      deleteSystemTemplate: vi.fn(S.deleteSystemTemplate.bind(S)),
      batchSetSystemTemplateEnabled: vi.fn(S.batchSetSystemTemplateEnabled.bind(S)),
    },
  };
});

vi.mock("../../../src/service/adminUser.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/adminUser.service")>();
  const S = actual.AdminUserService;
  return {
    ...actual,
    AdminUserService: {
      listUsers: vi.fn(S.listUsers.bind(S)),
      getUserById: vi.fn(S.getUserById.bind(S)),
      getUserByUserId: vi.fn(S.getUserByUserId.bind(S)),
      createUser: vi.fn(S.createUser.bind(S)),
      updateUser: vi.fn(S.updateUser.bind(S)),
      deleteUserById: vi.fn(S.deleteUserById.bind(S)),
      getUserOverview: vi.fn(S.getUserOverview.bind(S)),
      listUserActivities: vi.fn(S.listUserActivities.bind(S)),
      listAllActivities: vi.fn(S.listAllActivities.bind(S)),
      getActivityTypeSummary: vi.fn(S.getActivityTypeSummary.bind(S)),
      attachTodayQuota: vi.fn(S.attachTodayQuota.bind(S)),
      serializeUser: S.serializeUser.bind(S),
      buildHealthScoreSummary: S.buildHealthScoreSummary.bind(S),
      decodeBizUserIdParam: S.decodeBizUserIdParam.bind(S),
      resolveMongoIdFromBizUserRouteParam: vi.fn(
        S.resolveMongoIdFromBizUserRouteParam.bind(S),
      ),
      generateUserJwtByBizUserId: vi.fn(S.generateUserJwtByBizUserId.bind(S)),
    },
  };
});

vi.mock("../../../src/service/adminNote.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/adminNote.service")>();
  const S = actual.AdminNoteService;
  return {
    ...actual,
    AdminNoteService: {
      listNotes: vi.fn(S.listNotes.bind(S)),
      listRiskNotes: vi.fn(S.listRiskNotes.bind(S)),
      getRiskTaskSnapshot: vi.fn(S.getRiskTaskSnapshot.bind(S)),
      getNoteById: vi.fn(S.getNoteById.bind(S)),
      createNote: vi.fn(S.createNote.bind(S)),
      updateNote: vi.fn(S.updateNote.bind(S)),
      deleteNote: vi.fn(S.deleteNote.bind(S)),
      adminSetShareStatus: vi.fn(S.adminSetShareStatus.bind(S)),
      batchSetShare: vi.fn(S.batchSetShare.bind(S)),
      batchSetTags: vi.fn(S.batchSetTags.bind(S)),
    },
  };
});

import { AdminTemplateService } from "../../../src/service/adminTemplate.service";
import { AdminUserService } from "../../../src/service/adminUser.service";
import { AdminNoteService } from "../../../src/service/adminNote.service";

describe("integration: admin templates/users/notes catch branches", () => {
  const agent = createTestAgent();
  let auth: Record<string, string> = {};

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    auth = adminAuthHeader((await seedAdmin()).token);
    for (const fn of [
      AdminTemplateService.listTemplates,
      AdminTemplateService.listSystemTemplates,
      AdminTemplateService.createTemplate,
      AdminTemplateService.createSystemTemplate,
      AdminTemplateService.getTemplateById,
      AdminTemplateService.updateTemplate,
      AdminTemplateService.updateSystemTemplate,
      AdminTemplateService.deleteTemplate,
      AdminTemplateService.deleteSystemTemplate,
      AdminTemplateService.batchSetSystemTemplateEnabled,
      AdminUserService.listUsers,
      AdminUserService.createUser,
      AdminUserService.getUserById,
      AdminNoteService.listNotes,
      AdminNoteService.listRiskNotes,
      AdminNoteService.batchSetShare,
      AdminNoteService.batchSetTags,
      AdminNoteService.getNoteById,
    ]) {
      vi.mocked(fn as ReturnType<typeof vi.fn>).mockClear();
    }
  });

  it("templates Zod + service catch（默认 400）", async () => {
    expectClientErr(
      (await agent.get("/admin/templates").set(auth).query({ page: "x" })).status,
    );
    vi.mocked(AdminTemplateService.listTemplates).mockRejectedValueOnce(new Error("boom-tpl"));
    expectClientErr((await agent.get("/admin/templates").set(auth)).status);

    expectClientErr((await agent.post("/admin/templates").set(auth).send({})).status);
    vi.mocked(AdminTemplateService.createTemplate).mockRejectedValueOnce(new Error("boom-c"));
    const { userId } = await seedUser({ userId: "tpl-catch-u" });
    expectClientErr(
      (
        await agent.post("/admin/templates").set(auth).send({
          name: "t",
          userId,
          fields: { title: "a", content: "b", tags: [] },
        })
      ).status,
    );

    expect((await agent.get("/admin/templates/system").set(auth)).status).toBe(200);
    expectClientErr((await agent.post("/admin/templates/system").set(auth).send({})).status);
    vi.mocked(AdminTemplateService.createSystemTemplate).mockRejectedValueOnce(
      new Error("boom-sys"),
    );
    expectClientErr(
      (
        await agent.post("/admin/templates/system").set(auth).send({
          name: "sys",
          fields: { title: "a", content: "b", tags: [] },
        })
      ).status,
    );

    vi.mocked(AdminTemplateService.getTemplateById).mockResolvedValueOnce(null as never);
    expect(
      (await agent.get("/admin/templates/000000000000000000000001").set(auth)).status,
    ).toBe(404);

    vi.mocked(AdminTemplateService.updateTemplate).mockResolvedValueOnce(null as never);
    expect(
      (
        await agent
          .put("/admin/templates/000000000000000000000002")
          .set(auth)
          .send({ name: "x" })
      ).status,
    ).toBe(404);

    vi.mocked(AdminTemplateService.deleteTemplate).mockResolvedValueOnce(false);
    expect(
      (await agent.delete("/admin/templates/000000000000000000000003").set(auth)).status,
    ).toBe(404);

    // system batch-status Zod + catch
    expectClientErr(
      (
        await agent
          .post("/admin/templates/system/batch-status")
          .set(auth)
          .send({ ids: [], enabled: true })
      ).status,
    );
    vi.mocked(AdminTemplateService.batchSetSystemTemplateEnabled).mockRejectedValueOnce(
      new Error("boom-batch"),
    );
    expectClientErr(
      (
        await agent
          .post("/admin/templates/system/batch-status")
          .set(auth)
          .send({ ids: ["000000000000000000000001"], enabled: false })
      ).status,
    );

    // system export: selected 空 / filtered 筛选 / catch
    expectClientErr(
      (
        await agent
          .get("/admin/templates/system/export")
          .set(auth)
          .query({ mode: "selected" })
      ).status,
    );
    vi.mocked(AdminTemplateService.listSystemTemplates).mockResolvedValueOnce([
      {
        mongoId: "0000000000000000000000aa",
        id: "0000000000000000000000aa",
        systemKey: "k1",
        name: "系统A",
        description: "描述A",
        enabled: true,
        priority: 10,
        updatedAt: new Date().toISOString(),
      },
      {
        mongoId: "0000000000000000000000bb",
        id: "0000000000000000000000bb",
        systemKey: "k2",
        name: "系统B",
        description: "",
        enabled: false,
        priority: 20,
        updatedAt: new Date().toISOString(),
      },
    ] as never);
    expect(
      (
        await agent
          .get("/admin/templates/system/export")
          .set(auth)
          .query({
            mode: "filtered",
            enabled: "true",
            keyword: "系统",
          })
      ).status,
    ).toBe(200);
    vi.mocked(AdminTemplateService.listSystemTemplates).mockResolvedValueOnce([
      {
        mongoId: "0000000000000000000000aa",
        name: "选中",
        enabled: true,
        priority: 1,
        updatedAt: new Date().toISOString(),
      },
    ] as never);
    expect(
      (
        await agent
          .get("/admin/templates/system/export")
          .set(auth)
          .query({
            mode: "selected",
            ids: "0000000000000000000000aa,0000000000000000000000cc",
          })
      ).status,
    ).toBe(200);
    vi.mocked(AdminTemplateService.listSystemTemplates).mockRejectedValueOnce(
      new Error("boom-export"),
    );
    expect(
      (await agent.get("/admin/templates/system/export").set(auth)).status,
    ).toBeGreaterThanOrEqual(400);

    // system put/delete 404 + catch
    vi.mocked(AdminTemplateService.updateSystemTemplate).mockResolvedValueOnce(
      null as never,
    );
    expect(
      (
        await agent
          .put("/admin/templates/system/0000000000000000000000aa")
          .set(auth)
          .send({ name: "x" })
      ).status,
    ).toBe(404);
    vi.mocked(AdminTemplateService.updateSystemTemplate).mockRejectedValueOnce(
      new Error("boom-sys-up"),
    );
    expectClientErr(
      (
        await agent
          .put("/admin/templates/system/0000000000000000000000bb")
          .set(auth)
          .send({ name: "y" })
      ).status,
    );
    vi.mocked(AdminTemplateService.deleteSystemTemplate).mockResolvedValueOnce(false);
    expect(
      (
        await agent
          .delete("/admin/templates/system/0000000000000000000000cc")
          .set(auth)
      ).status,
    ).toBe(404);

    // user template update service throw（非 404）
    vi.mocked(AdminTemplateService.updateTemplate).mockRejectedValueOnce(
      new Error("boom-up"),
    );
    expectClientErr(
      (
        await agent
          .put("/admin/templates/0000000000000000000000ee")
          .set(auth)
          .send({ name: "z" })
      ).status,
    );
  });

  it("users Zod + service catch（默认 400）+ 活动 500", async () => {
    expectClientErr(
      (await agent.get("/admin/users").set(auth).query({ page: 9999, limit: 100 })).status,
    );
    vi.mocked(AdminUserService.listUsers).mockRejectedValueOnce(new Error("boom-users"));
    expectClientErr((await agent.get("/admin/users").set(auth)).status);

    expectClientErr(
      (await agent.post("/admin/users").set(auth).send({ userId: "" })).status,
    );
    vi.mocked(AdminUserService.createUser).mockRejectedValueOnce(new Error("用户已存在"));
    expectClientErr(
      (await agent.post("/admin/users").set(auth).send({ userId: "dup-u" })).status,
    );

    vi.mocked(AdminUserService.getUserById).mockResolvedValueOnce(null as never);
    expect(
      (await agent.get("/admin/users/0000000000000000000000aa").set(auth)).status,
    ).toBe(404);

    vi.mocked(AdminUserService.getActivityTypeSummary).mockRejectedValueOnce(
      new Error("boom-sum"),
    );
    expect((await agent.get("/admin/activity/summary").set(auth)).status).toBe(500);

    vi.mocked(AdminUserService.listAllActivities).mockRejectedValueOnce(new Error("boom-act"));
    expect((await agent.get("/admin/activity").set(auth)).status).toBe(500);
  });

  it("notes Zod + service catch + batch", async () => {
    expectClientErr(
      (await agent.get("/admin/notes").set(auth).query({ page: 9999, limit: 100 })).status,
    );
    vi.mocked(AdminNoteService.listNotes).mockRejectedValueOnce(new Error("boom-notes"));
    expectClientErr((await agent.get("/admin/notes").set(auth)).status);

    vi.mocked(AdminNoteService.listRiskNotes).mockRejectedValueOnce(new Error("boom-risk"));
    expectClientErr((await agent.get("/admin/notes/risk-items").set(auth)).status);

    vi.mocked(AdminNoteService.getNoteById).mockResolvedValueOnce(null as never);
    expect(
      (await agent.get("/admin/notes/000000000000000000000001").set(auth)).status,
    ).toBe(404);

    expectClientErr(
      (await agent.post("/admin/notes/batch-share").set(auth).send({ noteIds: [] })).status,
    );
    vi.mocked(AdminNoteService.batchSetShare).mockRejectedValueOnce(new Error("boom-share"));
    expectClientErr(
      (
        await agent
          .post("/admin/notes/batch-share")
          .set(auth)
          .send({ noteIds: ["000000000000000000000001"], isShare: true })
      ).status,
    );

    expectClientErr(
      (
        await agent
          .post("/admin/notes/batch-tags")
          .set(auth)
          .send({ noteIds: [], tags: [] })
      ).status,
    );
    vi.mocked(AdminNoteService.batchSetTags).mockRejectedValueOnce(new Error("boom-tags"));
    expectClientErr(
      (
        await agent
          .post("/admin/notes/batch-tags")
          .set(auth)
          .send({ noteIds: ["000000000000000000000001"], tags: ["a"] })
      ).status,
    );
  });
});
