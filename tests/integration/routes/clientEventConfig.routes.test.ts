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
  seedNotesAdmin,
} from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { ErrorCodes } from "../../../src/utils/response";
import { CLIENT_EVENT_NAMES } from "../../../src/constant/clientEvent";
import SystemConfig, {
  SYSTEM_CONFIG_CLIENT_EVENT_SETTINGS_KEY,
} from "../../../src/model/SystemConfig";
import { ClientEventConfigService } from "../../../src/service/clientEventConfig.service";

describe("integration: client event config", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("GET /events/config 无 token 返回 401", async () => {
    await agent.get("/events/config").expect(401);
  });

  it("GET /events/config 默认全部开启", async () => {
    const { token } = await createAuthUser();

    const res = await agent
      .get("/events/config")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.enabled).toBe(true);
    for (const name of CLIENT_EVENT_NAMES) {
      expect(res.body.data.events[name]).toBe(true);
    }
  });

  it("super GET /admin/client-event-config 返回 eventMeta", async () => {
    const { token } = await seedAdmin();

    const res = await agent
      .get("/admin/client-event-config")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.eventMeta).toHaveLength(CLIENT_EVENT_NAMES.length);
  });

  it("super PUT /admin/client-event-config 可关闭单个 eventName", async () => {
    const { token } = await seedAdmin();

    const getRes = await agent
      .get("/admin/client-event-config")
      .set(adminAuthHeader(token))
      .expect(200);

    const payload = {
      enabled: true,
      events: {
        ...getRes.body.data.events,
        me_menu_click: false,
      },
    };

    const putRes = await agent
      .put("/admin/client-event-config")
      .set(adminAuthHeader(token))
      .send(payload)
      .expect(200);

    expect(putRes.body.data.events.me_menu_click).toBe(false);

    const { token: userToken } = await createAuthUser();
    const clientRes = await agent
      .get("/events/config")
      .set(authHeader(userToken))
      .expect(200);

    expect(clientRes.body.data.events.me_menu_click).toBe(false);
  });

  it("super PUT 关闭总开关后客户端配置 enabled=false", async () => {
    const { token } = await seedAdmin();

    const getRes = await agent
      .get("/admin/client-event-config")
      .set(adminAuthHeader(token))
      .expect(200);

    await agent
      .put("/admin/client-event-config")
      .set(adminAuthHeader(token))
      .send({
        enabled: false,
        events: getRes.body.data.events,
      })
      .expect(200);

    const { token: userToken } = await createAuthUser();
    const clientRes = await agent
      .get("/events/config")
      .set(authHeader(userToken))
      .expect(200);

    expect(clientRes.body.data.enabled).toBe(false);
  });

  it("普通 admin GET /admin/client-event-config 返回 403", async () => {
    const { token } = await seedNotesAdmin();

    const res = await agent
      .get("/admin/client-event-config")
      .set(adminAuthHeader(token))
      .expect(403);

    expect(res.body.code).toBe(ErrorCodes.PERMISSION_ERROR);
  });

  it("PUT 非法 events 结构返回 400", async () => {
    const { token } = await seedAdmin();

    const res = await agent
      .put("/admin/client-event-config")
      .set(adminAuthHeader(token))
      .send({
        enabled: true,
        events: {
          unknown_event: false,
        },
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("PUT 缺少 eventName key 返回 400", async () => {
    const { token } = await seedAdmin();

    const res = await agent
      .put("/admin/client-event-config")
      .set(adminAuthHeader(token))
      .send({
        enabled: true,
        events: {
          me_menu_click: false,
        },
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });
});

describe("integration: client event config service cache", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("setForAdmin 后 getForClient 立即反映变更", async () => {
    await ClientEventConfigService.setForAdmin({
      enabled: true,
      events: Object.fromEntries(
        CLIENT_EVENT_NAMES.map((name) => [
          name,
          name !== "me_menu_click",
        ]),
      ) as Record<(typeof CLIENT_EVENT_NAMES)[number], boolean>,
    });

    const config = await ClientEventConfigService.getForClient();
    expect(config.events.me_menu_click).toBe(false);

    const doc = await SystemConfig.findOne({
      configKey: SYSTEM_CONFIG_CLIENT_EVENT_SETTINGS_KEY,
    }).lean();
    expect(doc?.clientEventSettings).toBeTruthy();
  });
});
