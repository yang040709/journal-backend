import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { createAuthUser } from "../../helpers/authFactory";
import SystemConfig, {
  SYSTEM_CONFIG_POINTS_RULES_KEY,
} from "../../../src/model/SystemConfig";
import UserAdRewardLog from "../../../src/model/UserAdRewardLog";
import UserAdDailyCounter from "../../../src/model/UserAdDailyCounter";
import User from "../../../src/model/User";
import PointsLedger from "../../../src/model/PointsLedger";
import { DEFAULT_POINTS_RULES, PointsService } from "../../../src/service/points.service";
import { getQuotaDateContext } from "../../../src/utils/dateKey";

describe("unit: PointsService ad daily limit", () => {
  beforeAll(async () => {
    await connectTestDb();
    await UserAdDailyCounter.createIndexes();
    await UserAdRewardLog.createIndexes();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    await SystemConfig.create({
      configKey: SYSTEM_CONFIG_POINTS_RULES_KEY,
      pointsRules: {
        ...DEFAULT_POINTS_RULES,
        globalAdDailyLimit: 2,
        pointsPerAd: 10,
      },
    });
  });

  it("并发多个 rewardToken 不超过日上限", async () => {
    const { userId } = await createAuthUser({ points: 0 });

    const tokens = ["t1", "t2", "t3", "t4"];
    const results = await Promise.allSettled(
      tokens.map((rewardToken, i) =>
        PointsService.grantAdReward(userId, {
          rewardToken,
          adProvider: "test",
          adUnitId: "unit",
          requestId: `req-${i}`,
        }),
      ),
    );

    const success = results.filter((r) => r.status === "fulfilled");
    expect(success.length).toBe(2);

    const logCount = await UserAdRewardLog.countDocuments({ userId });
    expect(logCount).toBe(2);
  });

  it("冷启动：已有当日 log 时 counter 对齐后不可超额", async () => {
    const { userId } = await createAuthUser({ points: 0 });
    const { dateKey } = getQuotaDateContext();
    const startOfDay = new Date(`${dateKey}T00:00:00+08:00`);

    await UserAdRewardLog.create([
      {
        userId,
        rewardToken: "legacy-1",
        rewardType: "points",
        rewardValue: 10,
        adProvider: "test",
        adUnitId: "unit",
        requestId: "r1",
        status: "success",
        createdAt: startOfDay,
      },
      {
        userId,
        rewardToken: "legacy-2",
        rewardType: "points",
        rewardValue: 10,
        adProvider: "test",
        adUnitId: "unit",
        requestId: "r2",
        status: "success",
        createdAt: startOfDay,
      },
    ]);

    await expect(
      PointsService.grantAdReward(userId, {
        rewardToken: "new-1",
        adProvider: "test",
        adUnitId: "unit",
        requestId: "r3",
      }),
    ).rejects.toMatchObject({ code: "POINTS_AD_REWARD_DAILY_LIMIT_EXCEEDED" });

    const counter = await UserAdDailyCounter.findOne({ userId, dateKey }).lean();
    expect(counter?.count).toBe(2);
    expect(await UserAdRewardLog.countDocuments({ userId })).toBe(2);
  });

  it("加点/流水失败时删除 log 并释放日槽，允许同 token 重试", async () => {
    const { userId } = await createAuthUser({ points: 0 });
    const spy = vi.spyOn(PointsLedger, "create").mockRejectedValue(new Error("ledger down"));

    await expect(
      PointsService.grantAdReward(userId, {
        rewardToken: "retry-token",
        adProvider: "test",
        adUnitId: "unit",
        requestId: "req-retry",
      }),
    ).rejects.toThrow("ledger down");
    spy.mockRestore();

    expect(await UserAdRewardLog.countDocuments({ rewardToken: "retry-token" })).toBe(0);
    const { dateKey } = getQuotaDateContext();
    const counter = await UserAdDailyCounter.findOne({ userId, dateKey }).lean();
    expect(counter?.count ?? 0).toBe(0);

    const ok = await PointsService.grantAdReward(userId, {
      rewardToken: "retry-token",
      adProvider: "test",
      adUnitId: "unit",
      requestId: "req-retry-2",
    });
    expect(ok.duplicated).toBe(false);
    expect(ok.points).toBe(10);

    const user = await User.findOne({ userId }).select("points").lean();
    expect(user?.points).toBe(10);
  });
});
