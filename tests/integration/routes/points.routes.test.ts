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
import { ErrorCodes } from "../../../src/utils/response";

describe("integration: /points", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("GET /points/summary 无 token 返回 401", async () => {
    await agent.get("/points/summary").expect(401);
  });

  it("GET /points/summary 返回积分与规则", async () => {
    const { token } = await createAuthUser({ points: 200 });

    const res = await agent
      .get("/points/summary")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.points).toBe(200);
    expect(res.body.data.rules.uploadExchange.enabled).toBe(true);
  });

  it("POST /points/exchange 积分不足返回 400", async () => {
    const { token } = await createAuthUser({ points: 10 });

    const res = await agent
      .post("/points/exchange")
      .set(authHeader(token))
      .send({ kind: "upload" })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.POINTS_INSUFFICIENT);
  });

  it("POST /points/exchange upload 成功扣积分", async () => {
    const { token } = await createAuthUser({ points: 200 });

    const res = await agent
      .post("/points/exchange")
      .set(authHeader(token))
      .send({ kind: "upload" })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.points).toBeLessThan(200);
    expect(res.body.data.quotaGain).toBeGreaterThan(0);
  });

  it("GET /points/transactions 返回分页流水", async () => {
    const { token } = await createAuthUser({ points: 200 });

    await agent
      .post("/points/exchange")
      .set(authHeader(token))
      .send({ kind: "upload" })
      .expect(200);

    const res = await agent
      .get("/points/transactions")
      .query({ page: 1, pageSize: 20 })
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.list.length).toBeGreaterThan(0);
    expect(res.body.data.pagination.total).toBeGreaterThan(0);
  });
});
