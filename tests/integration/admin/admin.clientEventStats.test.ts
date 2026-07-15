import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import {
  adminAuthHeader,
  seedAdmin,
  seedNotesAdmin,
} from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { ErrorCodes } from "../../../src/utils/response";
import ClientEvent from "../../../src/model/ClientEvent";
import { AdminClientEventStatsService } from "../../../src/service/adminClientEventStats.service";

async function seedClientEvent(
  overrides: Partial<{
    eventId: string;
    eventName: string;
    userId: string;
    platform: string;
    serverTs: Date;
    props: Record<string, unknown>;
  }> = {},
) {
  await ClientEvent.create({
    eventId: overrides.eventId ?? `evt_${Date.now()}_${Math.random()}`,
    eventName: overrides.eventName ?? "me_menu_click",
    userId: overrides.userId ?? "user-1",
    clientTs: Date.now(),
    serverTs: overrides.serverTs ?? new Date(),
    platform: overrides.platform ?? "mp-weixin",
    pagePath: "pages/me/me",
    requestId: "req_test_1",
    props: overrides.props ?? {
      section: "content",
      itemId: "template",
      action: "menu_click",
    },
  });
}

describe("integration: admin client event stats", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    AdminClientEventStatsService.invalidateReportCache();
  });

  it("super GET /admin/stats/client-events 返回聚合统计", async () => {
    const { token } = await seedAdmin();
    await seedClientEvent({
      eventId: "evt_me_1",
      props: {
        section: "content",
        itemId: "template",
        action: "menu_click",
      },
    });
    await seedClientEvent({
      eventId: "evt_me_2",
      userId: "user-2",
      props: {
        section: "content",
        itemId: "reminder",
        action: "menu_click",
      },
    });
    await seedClientEvent({
      eventId: "evt_detail_1",
      eventName: "note_detail_action_click",
      pagePath: "pages/note-detail/note-detail",
      props: {
        action: "edit",
        noteId: "note-1",
      },
    });

    const res = await agent
      .get("/admin/stats/client-events")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.totalEvents).toBe(3);
    expect(res.body.data.uniqueUsers).toBe(2);
    expect(res.body.data.eventSummary).toHaveLength(2);
    expect(res.body.data.actionStats).toHaveLength(3);
    expect(res.body.data.platformStats[0]).toMatchObject({
      platform: "mp-weixin",
      count: 3,
    });
  });

  it("支持按 eventName 筛选", async () => {
    const { token } = await seedAdmin();
    await seedClientEvent({ eventId: "evt_me_1" });
    await seedClientEvent({
      eventId: "evt_detail_1",
      eventName: "note_detail_action_click",
      props: { action: "edit", noteId: "note-1" },
    });

    const res = await agent
      .get("/admin/stats/client-events?eventName=me_menu_click")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.data.totalEvents).toBe(1);
    expect(res.body.data.eventSummary).toHaveLength(1);
    expect(res.body.data.eventSummary[0].eventName).toBe("me_menu_click");
  });

  it("普通 admin GET /admin/stats/client-events 返回 403", async () => {
    const { token } = await seedNotesAdmin();
    const res = await agent
      .get("/admin/stats/client-events")
      .set(adminAuthHeader(token))
      .expect(403);

    expect(res.body.code).toBe(ErrorCodes.PERMISSION_ERROR);
  });
});
