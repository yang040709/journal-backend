import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { authHeader, createAuthUser } from "../../helpers/authFactory";
import {
  adminAuthHeader,
  seedAdmin,
} from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import ClientEvent from "../../../src/model/ClientEvent";

function buildMeMenuEvent(eventId: string) {
  return {
    eventId,
    eventName: "me_menu_click",
    clientTs: Date.now(),
    platform: "mp-weixin",
    pagePath: "pages/me/me",
    props: {
      section: "content",
      itemId: "template",
      action: "menu_click",
    },
  };
}

describe("integration: /events", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("POST /events 无 token 返回 401", async () => {
    await agent
      .post("/events")
      .send({ events: [buildMeMenuEvent("evt_unauth_1")] })
      .expect(401);
  });

  it("POST /events 合法单条 me_menu_click 入库", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .post("/events")
      .set(authHeader(token))
      .send({ events: [buildMeMenuEvent("evt_me_1")] })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.accepted).toBe(1);
    expect(res.body.data.duplicated).toBe(0);
    expect(res.body.data.rejected).toBe(0);

    const docs = await ClientEvent.find({ eventId: "evt_me_1" }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]?.eventName).toBe("me_menu_click");
    expect(docs[0]?.props).toMatchObject({
      section: "content",
      itemId: "template",
    });
  });

  it("POST /events 同 eventId 重复提交记 duplicated", async () => {
    const { token } = await createAuthUser();
    const payload = { events: [buildMeMenuEvent("evt_dup_1")] };

    await agent
      .post("/events")
      .set(authHeader(token))
      .send(payload)
      .expect(200);

    const res = await agent
      .post("/events")
      .set(authHeader(token))
      .send(payload)
      .expect(200);

    expect(res.body.data.accepted).toBe(0);
    expect(res.body.data.duplicated).toBe(1);

    const count = await ClientEvent.countDocuments({ eventId: "evt_dup_1" });
    expect(count).toBe(1);
  });

  it("POST /events 非法 eventName 记 rejected，合法条目仍入库", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .post("/events")
      .set(authHeader(token))
      .send({
        events: [
          {
            eventId: "evt_bad_1",
            eventName: "unknown_event",
            clientTs: Date.now(),
            platform: "mp-weixin",
            pagePath: "pages/me/me",
            props: { action: "x" },
          },
          buildMeMenuEvent("evt_good_1"),
        ],
      })
      .expect(200);

    expect(res.body.data.accepted).toBe(1);
    expect(res.body.data.rejected).toBe(1);

    const good = await ClientEvent.findOne({ eventId: "evt_good_1" }).lean();
    const bad = await ClientEvent.findOne({ eventId: "evt_bad_1" }).lean();
    expect(good).toBeTruthy();
    expect(bad).toBeNull();
  });

  it("POST /events 批量 2 条 accepted=2", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .post("/events")
      .set(authHeader(token))
      .send({
        events: [
          buildMeMenuEvent("evt_batch_1"),
          buildMeMenuEvent("evt_batch_2"),
        ],
      })
      .expect(200);

    expect(res.body.data.accepted).toBe(2);
    expect(await ClientEvent.countDocuments()).toBe(2);
  });

  it("POST /events 关闭 me_menu_click 后 rejected", async () => {
    const { token: adminToken } = await seedAdmin();

    const configRes = await agent
      .get("/admin/client-event-config")
      .set(adminAuthHeader(adminToken))
      .expect(200);

    await agent
      .put("/admin/client-event-config")
      .set(adminAuthHeader(adminToken))
      .send({
        enabled: true,
        events: {
          ...configRes.body.data.events,
          me_menu_click: false,
        },
      })
      .expect(200);

    const { token } = await createAuthUser();

    const res = await agent
      .post("/events")
      .set(authHeader(token))
      .send({ events: [buildMeMenuEvent("evt_disabled_1")] })
      .expect(200);

    expect(res.body.data.accepted).toBe(0);
    expect(res.body.data.rejected).toBe(1);
    expect(await ClientEvent.countDocuments()).toBe(0);
  });
});
