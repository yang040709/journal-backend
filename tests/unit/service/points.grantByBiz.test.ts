import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { createAuthUser } from "../../helpers/authFactory";
import User from "../../../src/model/User";
import PointsLedger from "../../../src/model/PointsLedger";
import { PointsService } from "../../../src/service/points.service";

describe("unit: PointsService.grantPointsByBiz", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("并发同 bizId 只加分一次", async () => {
    const { userId } = await createAuthUser({ points: 100 });
    const input = {
      userId,
      points: 50,
      kind: "feedback_reward" as const,
      bizType: "test_grant_biz",
      bizId: "same-biz-id",
      title: "测试发分",
    };

    const [a, b] = await Promise.all([
      PointsService.grantPointsByBiz(input),
      PointsService.grantPointsByBiz(input),
    ]);

    const duplicatedCount = [a, b].filter((r) => r.duplicated).length;
    expect(duplicatedCount).toBe(1);

    const user = await User.findOne({ userId }).select("points").lean();
    expect(user?.points).toBe(150);

    const ledgers = await PointsLedger.countDocuments({
      bizType: "test_grant_biz",
      bizId: "same-biz-id",
    });
    expect(ledgers).toBe(1);
  });
});
