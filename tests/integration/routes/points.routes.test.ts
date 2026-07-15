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

  it("POST /points/exchange 相同 Idempotency-Key 只扣一次积分", async () => {
    const { token } = await createAuthUser({ points: 200 });
    const headers = {
      ...authHeader(token),
      "Idempotency-Key": "idem-exchange-upload-1",
    };

    const first = await agent
      .post("/points/exchange")
      .set(headers)
      .send({ kind: "upload" })
      .expect(200);
    const second = await agent
      .post("/points/exchange")
      .set(headers)
      .send({ kind: "upload" })
      .expect(200);

    expect(first.body.data.points).toBe(second.body.data.points);
    expect(first.body.data.points).toBeLessThan(200);
  });

  it("POST /points/exchange 两用户相同裸 requestId 互不影响", async () => {
    const a = await createAuthUser({ userId: "pts-a", points: 200 });
    const b = await createAuthUser({ userId: "pts-b", points: 200 });
    const sharedRequestId = "shared-client-request-id";

    const resA = await agent
      .post("/points/exchange")
      .set({ ...authHeader(a.token), "X-Request-Id": sharedRequestId })
      .send({ kind: "upload" })
      .expect(200);
    const resB = await agent
      .post("/points/exchange")
      .set({ ...authHeader(b.token), "X-Request-Id": sharedRequestId })
      .send({ kind: "upload" })
      .expect(200);

    expect(resA.body.code).toBe(0);
    expect(resB.body.code).toBe(0);
    expect(resA.body.data.points).toBeLessThan(200);
    expect(resB.body.data.points).toBeLessThan(200);
  });

  it("ad-reward Zod/凭证无效；transactions Zod；campaigns 404", async () => {
    const { token } = await createAuthUser({ points: 50 });
    const h = authHeader(token);

    expect(
      (await agent.post("/points/ad-reward").set(h).send({})).status,
    ).toBe(400);
    expect(
      (
        await agent
          .post("/points/ad-reward")
          .set(h)
          .send({
            adProvider: "wx",
            adUnitId: "u1",
            rewardToken: "tok-route-1",
            requestId: "r1",
          })
      ).status,
    ).toBe(200);
    expect(
      (
        await agent
          .post("/points/ad-reward")
          .set(h)
          .send({
            adProvider: "wx",
            adUnitId: "u1",
            rewardToken: "tok-route-1",
          })
      ).status,
    ).toBe(200);

    expect(
      (await agent.get("/points/transactions").set(h).query({ page: "x" })).status,
    ).toBe(400);
    expect(
      (
        await agent
          .get("/points/transactions")
          .set(h)
          .query({ page: 1, pageSize: 10, flowType: "income" })
      ).status,
    ).toBe(200);
    expect(
      (
        await agent
          .get("/points/transactions")
          .set(h)
          .query({ page: 1, flowType: "expense" })
      ).status,
    ).toBe(200);

    expect(
      (await agent.post("/points/exchange").set(h).send({ kind: "nope" })).status,
    ).toBe(400);
    expect(
      (await agent.post("/points/exchange").set(h).send({ kind: "ai" })).status,
    ).toBeLessThan(500);

    expect(
      (await agent.get("/points/campaigns/000000000000000000000000").set(h)).status,
    ).toBe(404);
    expect(
      (
        await agent
          .post("/points/campaigns/000000000000000000000000/claim")
          .set(h)
          .send({})
      ).status,
    ).toBe(404);
  });
});
