import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import UserAiUsageDaily from "../../../src/model/UserAiUsageDaily";
import UserUploadQuotaDaily from "../../../src/model/UserUploadQuotaDaily";
import UserAdRewardLog from "../../../src/model/UserAdRewardLog";
import { AdminQuotaService } from "../../../src/service/adminQuota.service";

describe("unit: AdminQuotaService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("listAiUsageDaily 支持筛选与 mongoUserId 映射", async () => {
    const { userId } = await seedUser({ userId: "quota-ai-1" });
    await UserAiUsageDaily.create({
      userId,
      dateKey: "2026-07-01",
      usedCount: 3,
    });
    await UserAiUsageDaily.create({
      userId: "orphan",
      dateKey: "2026-07-02",
      usedCount: 1,
    });

    const page = await AdminQuotaService.listAiUsageDaily({
      page: 0,
      limit: 200,
      userId,
      dateKeyFrom: "2026-07-01",
      dateKeyTo: "2026-07-01",
    });
    expect(page.page).toBe(1);
    expect(page.limit).toBe(100);
    expect(page.total).toBe(1);
    expect(page.items[0].usedCount).toBe(3);
    expect(page.items[0].mongoUserId).toBeTruthy();
  });

  it("listUploadQuotaDaily / listAdRewardLogs 带日期与类型过滤", async () => {
    const { userId } = await seedUser({ userId: "quota-up-1" });
    await UserUploadQuotaDaily.create({
      userId,
      dateKey: "2026-07-10",
      baseLimit: 10,
      extraQuota: 2,
      usedCount: 1,
      bizBreakdown: { note: 1 },
    });
    const from = Date.now() - 1000;
    await UserAdRewardLog.create({
      userId,
      rewardToken: "tok-1",
      rewardType: "points",
      rewardValue: 1,
      adProvider: "test",
      adUnitId: "u1",
      requestId: "r1",
      status: "success",
    });

    const upload = await AdminQuotaService.listUploadQuotaDaily({
      page: 1,
      limit: 10,
      dateKeyFrom: "2026-07-10",
    });
    expect(upload.total).toBe(1);
    expect(upload.items[0].extraQuota).toBe(2);

    const ads = await AdminQuotaService.listAdRewardLogs({
      page: 1,
      limit: 10,
      userId,
      rewardType: "points",
      createdAtFrom: from,
      createdAtTo: Date.now() + 1000,
    });
    expect(ads.total).toBe(1);
    expect(ads.items[0].rewardToken).toBe("tok-1");
    expect(ads.items[0].mongoUserId).toBeTruthy();
  });
});

