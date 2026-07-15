import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { createAuthUser } from "../../helpers/authFactory";
import User from "../../../src/model/User";
import PointsLedger from "../../../src/model/PointsLedger";
import { FeedbackService } from "../../../src/service/feedback.service";
import { PointsService } from "../../../src/service/points.service";

describe("unit: feedback weekly first reward", () => {
  beforeAll(async () => {
    await connectTestDb();
    await PointsLedger.createIndexes();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("并发两条本周反馈只发放一次周首奖", async () => {
    const baseline = 50;
    const { userId } = await createAuthUser({ points: baseline });
    await PointsService.ensureRulesDocumentExists();
    const rules = await PointsService.getRules();
    const weekly = rules.feedbackRewards.weeklyFirstSubmit;

    const results = await Promise.allSettled([
      FeedbackService.createFeedback({
        userId,
        type: "demand",
        content: "并发反馈内容甲甲甲甲甲甲",
      }),
      FeedbackService.createFeedback({
        userId,
        type: "demand",
        content: "并发反馈内容乙乙乙乙乙乙",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const user = await User.findOne({ userId }).select("points").lean();
    expect(user?.points).toBe(baseline + weekly);

    const ledgerCount = await PointsLedger.countDocuments({
      userId,
      bizType: "feedback_weekly_first_reward",
    });
    expect(ledgerCount).toBe(1);
  });
});
