import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import User from "../../../src/model/User";
import PointsLedger from "../../../src/model/PointsLedger";
import { PointsService } from "../../../src/service/points.service";
import { getQuotaDateContext } from "../../../src/utils/dateKey";

const admin = { id: "a1", username: "admin" };

describe("unit: PointsService branch coverage", () => {
  beforeAll(async () => {
    await connectTestDb();
    await PointsLedger.createIndexes();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    await PointsService.ensureRulesDocumentExists();
  });

  it("getRules / setRulesFromAdmin / getSummary / adminSetPoints", async () => {
    const rules = await PointsService.getRules();
    expect(rules.pointsPerAd).toBeGreaterThan(0);

    const next = await PointsService.setRulesFromAdmin(
      {
        pointsPerAd: 7,
        globalAdDailyLimit: 3,
        uploadExchange: { enabled: true, pointsCost: 10, quotaGain: 1 },
        aiExchange: { enabled: true, pointsCost: 20, quotaGain: 1 },
        feedbackRewards: { weeklyFirstSubmit: 11, important: 22, critical: 33 },
      },
      admin,
    );
    expect(next.pointsPerAd).toBe(7);
    expect(next.feedbackRewards.critical).toBe(33);

    const { userId } = await seedUser({ userId: "pts-sum", points: 40 });
    const summary = await PointsService.getSummary(userId);
    expect(summary.points).toBe(40);
    expect(summary.rules.pointsPerAd).toBe(7);

    const set = await PointsService.adminSetPoints(userId, 99, "人工调整测试", admin);
    expect(set.points).toBe(99);
    expect((await User.findOne({ userId }).lean())?.points).toBe(99);
  });

  it("exchange upload/ai 成功与关闭/不足；list/adminListTransactions", async () => {
    const { userId } = await seedUser({ userId: "pts-ex", points: 100 });
    await PointsService.setRulesFromAdmin(
      {
        uploadExchange: { enabled: true, pointsCost: 10, quotaGain: 2 },
        aiExchange: { enabled: true, pointsCost: 15, quotaGain: 1 },
      },
      admin,
    );

    const up = await PointsService.exchange(userId, "upload");
    expect(up.points).toBe(90);
    const ai = await PointsService.exchange(userId, "ai");
    expect(ai.points).toBe(75);

    await User.updateOne({ userId }, { $set: { points: 5 } });
    await expect(PointsService.exchange(userId, "upload")).rejects.toThrow();

    await PointsService.setRulesFromAdmin(
      { uploadExchange: { enabled: false, pointsCost: 10, quotaGain: 1 } },
      admin,
    );
    await User.updateOne({ userId }, { $set: { points: 100 } });
    await expect(PointsService.exchange(userId, "upload")).rejects.toThrow();

    const list = await PointsService.listUserTransactions(userId, {
      page: 1,
      pageSize: 10,
      flowType: "all",
    });
    expect(list.pagination.total).toBeGreaterThanOrEqual(1);

    const adminList = await PointsService.adminListTransactions({
      page: 1,
      pageSize: 10,
      userId,
      flowType: "expense",
    });
    expect(adminList.pagination.total).toBeGreaterThanOrEqual(1);

    await expect(
      PointsService.adminListTransactions({
        page: 9999,
        pageSize: 100,
        flowType: "all",
      }),
    ).rejects.toThrow(/分页深度/);
  });

  it("ad daily slot / effective limit / grantAdReward 空 token", async () => {
    const { userId } = await seedUser({ userId: "pts-ad", points: 0 });
    await User.updateOne({ userId }, { $set: { adRewardDailyLimit: 2 } });
    await PointsService.setRulesFromAdmin(
      { pointsPerAd: 5, globalAdDailyLimit: 10 },
      admin,
    );

    const rules = await PointsService.getRules();
    expect(await PointsService.getEffectiveDailyAdLimit(userId, rules)).toBe(2);

    await PointsService.bootstrapLegacyUserPoints(userId);
    expect(await PointsService.getTodayVideoAdCount(userId)).toBeGreaterThanOrEqual(0);

    const { dateKey } = getQuotaDateContext();
    expect(await PointsService.tryClaimAdDailySlot(userId, dateKey, 2)).toBe(true);
    await PointsService.releaseAdDailySlot(userId, dateKey);

    await expect(
      PointsService.grantAdReward(userId, {
        rewardToken: "  ",
        adUnitId: "u1",
        adProvider: "wx",
        requestId: "r1",
      } as never),
    ).rejects.toThrow(/凭证/);
  });

  it("grantPointsByBiz 边界：0 分 / 幂等", async () => {
    const { userId } = await seedUser({ userId: "pts-zero", points: 1 });
    const zero = await PointsService.grantPointsByBiz({
      userId,
      points: 0,
      kind: "feedback_reward",
      bizType: "t0",
      bizId: "b0",
      title: "zero",
    });
    expect(zero.points).toBe(1);

    const a = await PointsService.grantPointsByBiz({
      userId,
      points: 5,
      kind: "feedback_reward",
      bizType: "t1",
      bizId: "same",
      title: "once",
    });
    const b = await PointsService.grantPointsByBiz({
      userId,
      points: 5,
      kind: "feedback_reward",
      bizType: "t1",
      bizId: "same",
      title: "once",
    });
    expect(a.duplicated || b.duplicated).toBe(true);
    expect(Math.max(a.points, b.points)).toBe(6);
  });

  it("exchangeNoteExport / grantAdReward 成功与重复", async () => {
    const { userId } = await seedUser({ userId: "pts-export", points: 500 });
    const exported = await PointsService.exchangeNoteExport(userId, 2, {
      requestId: "export-req-1",
    });
    expect(exported.exportExtraCredits).toBeGreaterThanOrEqual(2);
    expect(exported.points).toBeLessThan(500);

    await expect(
      PointsService.exchangeNoteExport("missing-user", 1),
    ).rejects.toThrow();

    await User.updateOne({ userId }, { $set: { points: 0 } });
    await expect(PointsService.exchangeNoteExport(userId, 1)).rejects.toThrow();

    await User.updateOne({ userId }, { $set: { points: 100, adRewardDailyLimit: 5 } });
    const reward = await PointsService.grantAdReward(userId, {
      rewardToken: "tok-unique-1",
      adUnitId: "ad1",
      adProvider: "wx",
      requestId: "ad-req-1",
    } as never);
    expect(reward.rewardPoints).toBeGreaterThan(0);
    expect(reward.duplicated).toBe(false);

    const dup = await PointsService.grantAdReward(userId, {
      rewardToken: "tok-unique-1",
      adUnitId: "ad1",
      adProvider: "wx",
      requestId: "ad-req-2",
    } as never);
    expect(dup.duplicated).toBe(true);

    await expect(
      PointsService.grantAdReward("other-user", {
        rewardToken: "tok-unique-1",
        adUnitId: "ad1",
        adProvider: "wx",
        requestId: "ad-req-3",
      } as never),
    ).rejects.toThrow(/凭证/);
  });

  it("normalizeRules / clamp：脏入参、无上限截断、关闭 ai 兑换", async () => {
    const next = await PointsService.setRulesFromAdmin(
      {
        pointsPerAd: "not-a-number" as never,
        globalAdDailyLimit: -5,
        uploadExchange: { enabled: true, pointsCost: 0, quotaGain: 99999999 },
        aiExchange: { enabled: false, pointsCost: 5, quotaGain: 1 },
        feedbackRewards: {
          weeklyFirstSubmit: -1,
          important: "x" as never,
          critical: 999999,
        },
      },
      admin,
    );
    expect(next.pointsPerAd).toBeGreaterThanOrEqual(1);
    expect(next.globalAdDailyLimit).toBe(0);
    expect(next.uploadExchange.pointsCost).toBeGreaterThanOrEqual(1);
    expect(next.aiExchange.enabled).toBe(false);
    expect(next.feedbackRewards.critical).toBeLessThanOrEqual(10_000);

    const { userId } = await seedUser({ userId: "pts-ai-off", points: 100 });
    await expect(PointsService.exchange(userId, "ai")).rejects.toThrow(/维护/);
  });

  it("广告日限额占满、limit<=0 不限、缺用户兑换", async () => {
    const { userId } = await seedUser({ userId: "pts-limit", points: 0 });
    await User.updateOne({ userId }, { $set: { adRewardDailyLimit: 1 } });
    await PointsService.setRulesFromAdmin(
      { pointsPerAd: 3, globalAdDailyLimit: 1 },
      admin,
    );

    const first = await PointsService.grantAdReward(userId, {
      rewardToken: "tok-limit-1",
      adUnitId: "ad1",
      adProvider: "wx",
      requestId: "lim-1",
    } as never);
    expect(first.duplicated).toBe(false);

    await expect(
      PointsService.grantAdReward(userId, {
        rewardToken: "tok-limit-2",
        adUnitId: "ad1",
        adProvider: "wx",
        requestId: "lim-2",
      } as never),
    ).rejects.toThrow(/上限|额度|limit|广告/i);

    const { dateKey } = getQuotaDateContext();
    expect(await PointsService.tryClaimAdDailySlot(userId, dateKey, 0)).toBe(true);

    await expect(PointsService.exchange("nobody-pts", "upload")).rejects.toThrow(
      /用户不存在|兑换/,
    );

    const rules = await PointsService.getRules();
    expect(await PointsService.getEffectiveDailyAdLimit(userId, rules)).toBe(1);
    await User.updateOne({ userId }, { $unset: { adRewardDailyLimit: 1 } });
    await PointsService.setRulesFromAdmin({ globalAdDailyLimit: 9 }, admin);
    const rules2 = await PointsService.getRules();
    expect(await PointsService.getEffectiveDailyAdLimit(userId, rules2)).toBe(9);
  });

  it("exchange 幂等键复用；listTransactions 筛选；adminSetPoints 备注空", async () => {
    const { userId } = await seedUser({ userId: "pts-idem", points: 200 });
    await PointsService.setRulesFromAdmin(
      {
        uploadExchange: { enabled: true, pointsCost: 10, quotaGain: 1 },
        aiExchange: { enabled: true, pointsCost: 10, quotaGain: 1 },
      },
      admin,
    );

    const a = await PointsService.exchange(userId, "upload", {
      idempotencyKey: "same-key",
    });
    const b = await PointsService.exchange(userId, "upload", {
      idempotencyKey: "same-key",
    });
    expect(a.points).toBe(b.points);

    const income = await PointsService.listUserTransactions(userId, {
      page: 1,
      pageSize: 5,
      flowType: "income",
    });
    expect(income.pagination.page).toBe(1);

    const expense = await PointsService.adminListTransactions({
      page: 1,
      pageSize: 5,
      flowType: "expense",
      bizType: "exchange_image_quota",
    });
    expect(expense.pagination.total).toBeGreaterThanOrEqual(0);

    const set = await PointsService.adminSetPoints(userId, 50, "   ", admin);
    expect(set.points).toBe(50);

    await expect(
      PointsService.adminSetPoints("ghost-user", 1, "x", admin),
    ).rejects.toThrow();
  });
});
