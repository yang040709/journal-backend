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

const expectErr = (status: number) => expect(status).toBeGreaterThanOrEqual(400);

vi.mock("../../../src/service/announcement.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/announcement.service")>();
  const S = actual.AnnouncementService;
  return {
    ...actual,
    AnnouncementService: {
      buildFrontendPath: S.buildFrontendPath.bind(S),
      listPublic: vi.fn(S.listPublic.bind(S)),
      getPublishedDetailAndIncreaseView: vi.fn(S.getPublishedDetailAndIncreaseView.bind(S)),
      adminList: vi.fn(S.adminList.bind(S)),
      adminGetById: vi.fn(S.adminGetById.bind(S)),
      adminCreate: vi.fn(S.adminCreate.bind(S)),
      adminUpdate: vi.fn(S.adminUpdate.bind(S)),
      adminPublish: vi.fn(S.adminPublish.bind(S)),
      adminOffline: vi.fn(S.adminOffline.bind(S)),
      adminDeleteDraft: vi.fn(S.adminDeleteDraft.bind(S)),
    },
  };
});

vi.mock("../../../src/service/adminGallery.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/adminGallery.service")>();
  const S = actual.AdminGalleryService;
  return {
    ...actual,
    AdminGalleryService: {
      createCosStsCredential: vi.fn(S.createCosStsCredential.bind(S)),
      recordUploadedImage: vi.fn(S.recordUploadedImage.bind(S)),
      listImages: vi.fn(S.listImages.bind(S)),
      hideImage: vi.fn(S.hideImage.bind(S)),
    },
  };
});

vi.mock("../../../src/service/aiStyle.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/service/aiStyle.service")>();
  const S = actual.AiStyleService;
  return {
    ...actual,
    AiStyleService: {
      ensureSeed: vi.fn(S.ensureSeed.bind(S)),
      listEnabledForClient: vi.fn(S.listEnabledForClient.bind(S)),
      listForAdmin: vi.fn(S.listForAdmin.bind(S)),
      getByIdForAdmin: vi.fn(S.getByIdForAdmin.bind(S)),
      createForAdmin: vi.fn(S.createForAdmin.bind(S)),
      updateForAdmin: vi.fn(S.updateForAdmin.bind(S)),
      setEnabled: vi.fn(S.setEnabled.bind(S)),
      setDefault: vi.fn(S.setDefault.bind(S)),
      resolveActiveStyle: vi.fn(S.resolveActiveStyle.bind(S)),
      buildPrompt: S.buildPrompt.bind(S),
    },
  };
});

vi.mock("../../../src/service/adminNoteBook.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/adminNoteBook.service")>();
  const S = actual.AdminNoteBookService;
  const out: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(S)) {
    if (key === "length" || key === "name" || key === "prototype") continue;
    const v = (S as Record<string, unknown>)[key];
    if (typeof v === "function") {
      out[key] = vi.fn((v as (...a: unknown[]) => unknown).bind(S));
    }
  }
  return { ...actual, AdminNoteBookService: out };
});

vi.mock("../../../src/service/adminReminder.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/adminReminder.service")>();
  const S = actual.AdminReminderService;
  const out: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(S)) {
    if (key === "length" || key === "name" || key === "prototype") continue;
    const v = (S as Record<string, unknown>)[key];
    if (typeof v === "function") {
      out[key] = vi.fn((v as (...a: unknown[]) => unknown).bind(S));
    }
  }
  return { ...actual, AdminReminderService: out };
});

vi.mock("../../../src/service/points.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/service/points.service")>();
  const S = actual.PointsService;
  return {
    ...actual,
    PointsService: {
      ...Object.fromEntries(
        Object.getOwnPropertyNames(S)
          .filter((k) => !["length", "name", "prototype"].includes(k))
          .filter((k) => typeof (S as Record<string, unknown>)[k] === "function")
          .map((k) => [
            k,
            vi.fn(((S as Record<string, unknown>)[k] as (...a: unknown[]) => unknown).bind(S)),
          ]),
      ),
    },
  };
});

vi.mock("../../../src/service/userMigration.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/userMigration.service")>();
  const S = actual.UserMigrationService;
  const out: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(S)) {
    if (key === "length" || key === "name" || key === "prototype") continue;
    const v = (S as Record<string, unknown>)[key];
    if (typeof v === "function") {
      out[key] = vi.fn((v as (...a: unknown[]) => unknown).bind(S));
    }
  }
  return { ...actual, UserMigrationService: out };
});

vi.mock("../../../src/service/alertRule.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/alertRule.service")>();
  const S = actual.AlertRuleService;
  const out: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(S)) {
    if (key === "length" || key === "name" || key === "prototype") continue;
    const v = (S as Record<string, unknown>)[key];
    if (typeof v === "function") {
      out[key] = vi.fn((v as (...a: unknown[]) => unknown).bind(S));
    }
  }
  return { ...actual, AlertRuleService: out };
});

import { AnnouncementService } from "../../../src/service/announcement.service";
import { AdminGalleryService } from "../../../src/service/adminGallery.service";
import { AiStyleService } from "../../../src/service/aiStyle.service";
import { AdminNoteBookService } from "../../../src/service/adminNoteBook.service";
import { AdminReminderService } from "../../../src/service/adminReminder.service";
import { PointsService } from "../../../src/service/points.service";
import { UserMigrationService } from "../../../src/service/userMigration.service";
import { AlertRuleService } from "../../../src/service/alertRule.service";

describe("integration: admin announcements/gallery/aiStyles/core catch branches", () => {
  const agent = createTestAgent();
  let auth: Record<string, string> = {};

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    auth = adminAuthHeader((await seedAdmin()).token);
  });

  it("announcements Zod / 404 / catch", async () => {
    expectErr(
      (await agent.get("/admin/announcements").set(auth).query({ page: "x" })).status,
    );
    vi.mocked(AnnouncementService.adminList).mockRejectedValueOnce(new Error("boom-list"));
    expectErr((await agent.get("/admin/announcements").set(auth)).status);

    expectErr((await agent.post("/admin/announcements").set(auth).send({})).status);
    vi.mocked(AnnouncementService.adminCreate).mockRejectedValueOnce(new Error("boom-c"));
    expectErr(
      (
        await agent
          .post("/admin/announcements")
          .set(auth)
          .send({ title: "t", content: "c", status: "draft" })
      ).status,
    );

    vi.mocked(AnnouncementService.adminGetById).mockResolvedValueOnce(null as never);
    expect(
      (await agent.get("/admin/announcements/000000000000000000000001").set(auth)).status,
    ).toBe(404);

    vi.mocked(AnnouncementService.adminPublish).mockRejectedValueOnce(new Error("公告不存在"));
    expectErr(
      (
        await agent
          .post("/admin/announcements/000000000000000000000002/publish")
          .set(auth)
      ).status,
    );

    vi.mocked(AnnouncementService.adminOffline).mockRejectedValueOnce(new Error("boom-off"));
    expectErr(
      (
        await agent
          .post("/admin/announcements/000000000000000000000003/offline")
          .set(auth)
      ).status,
    );

    vi.mocked(AnnouncementService.adminDeleteDraft).mockRejectedValueOnce(
      new Error("只能删除草稿"),
    );
    expectErr(
      (await agent.delete("/admin/announcements/000000000000000000000004").set(auth)).status,
    );
  });

  it("gallery catch", async () => {
    vi.mocked(AdminGalleryService.listImages).mockRejectedValueOnce(new Error("boom-gal"));
    expectErr((await agent.get("/admin/gallery/images").set(auth)).status);

    expectErr((await agent.post("/admin/gallery/sts").set(auth).send({})).status);
    vi.mocked(AdminGalleryService.createCosStsCredential).mockRejectedValueOnce(
      new Error("boom-sts"),
    );
    expectErr(
      (
        await agent
          .post("/admin/gallery/sts")
          .set(auth)
          .send({ prefix: "admin-gallery/" })
      ).status,
    );

    vi.mocked(AdminGalleryService.hideImage).mockResolvedValueOnce(false);
    expectErr(
      (await agent.delete("/admin/gallery/images/000000000000000000000001").set(auth)).status,
    );
  });

  it("ai styles catch", async () => {
    vi.mocked(AiStyleService.listForAdmin).mockRejectedValueOnce(new Error("boom-styles"));
    expectErr((await agent.get("/admin/ai/styles").set(auth)).status);

    expectErr((await agent.post("/admin/ai/styles").set(auth).send({})).status);
    vi.mocked(AiStyleService.createForAdmin).mockRejectedValueOnce(new Error("boom-create"));
    expectErr(
      (
        await agent.post("/admin/ai/styles").set(auth).send({
          key: "k1",
          name: "n1",
          systemPrompt: "s",
          userPromptTemplate: "u",
        })
      ).status,
    );

    vi.mocked(AiStyleService.getByIdForAdmin).mockResolvedValueOnce(null as never);
    expect(
      (await agent.get("/admin/ai/styles/000000000000000000000001").set(auth)).status,
    ).toBe(404);

    vi.mocked(AiStyleService.setEnabled).mockResolvedValueOnce(null as never);
    expectErr(
      (
        await agent
          .post("/admin/ai/styles/000000000000000000000002/enable")
          .set(auth)
          .send({ enabled: true })
      ).status,
    );

    vi.mocked(AiStyleService.setDefault).mockResolvedValueOnce(null as never);
    expectErr(
      (
        await agent
          .post("/admin/ai/styles/000000000000000000000003/default")
          .set(auth)
      ).status,
    );
  });

  it("notebooks + reminders catch", async () => {
    const listNb = (AdminNoteBookService as { listNoteBooks?: ReturnType<typeof vi.fn> })
      .listNoteBooks;
    if (listNb) {
      listNb.mockRejectedValueOnce(new Error("boom-nb"));
      expectErr((await agent.get("/admin/notebooks").set(auth)).status);
    } else {
      expectErr((await agent.get("/admin/notebooks").set(auth).query({ page: "x" })).status);
    }

    const listRem = (AdminReminderService as { listReminders?: ReturnType<typeof vi.fn> })
      .listReminders;
    if (listRem) {
      listRem.mockRejectedValueOnce(new Error("boom-rem"));
      expectErr((await agent.get("/admin/reminders").set(auth)).status);
    } else {
      expectErr((await agent.get("/admin/reminders").set(auth).query({ page: "x" })).status);
    }
  });

  it("usersExtra points rules + migration task + alerts", async () => {
    vi.mocked(PointsService.getRules).mockRejectedValueOnce(new Error("boom-rules"));
    expect((await agent.get("/admin/points/rules").set(auth)).status).toBe(500);

    expect(
      (await agent.get("/admin/users/migration/tasks/").set(auth)).status,
    ).toBeGreaterThanOrEqual(400);

    vi.mocked(UserMigrationService.getTaskDetail).mockResolvedValueOnce(null as never);
    expect(
      (await agent.get("/admin/users/migration/tasks/missing-task").set(auth)).status,
    ).toBe(404);

    const listRules = AlertRuleService.listRules as ReturnType<typeof vi.fn> | undefined;
    listRules?.mockRejectedValueOnce(new Error("boom-alert"));
    expectErr((await agent.get("/admin/alerts/rules").set(auth)).status);

    // put with empty body: Zod or missing rule → 400/404
    const putStatus = (
      await agent.put("/admin/alerts/rules/missing-key").set(auth).send({})
    ).status;
    expect([400, 404]).toContain(putStatus);

    expect(
      (await agent.get("/admin/alerts/events/000000000000000000000099").set(auth)).status,
    ).toBeGreaterThanOrEqual(400);

    expectErr(
      (await agent.get("/admin/quota/ai-daily").set(auth).query({ page: "x" })).status,
    );
    expectErr(
      (await agent.get("/admin/quota/upload-daily").set(auth).query({ page: "bad" })).status,
    );
  });
});
