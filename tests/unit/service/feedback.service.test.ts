import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import UserFeedback from "../../../src/model/UserFeedback";
import {
  FeedbackRateLimitError,
  FeedbackService,
} from "../../../src/service/feedback.service";
import { PointsService } from "../../../src/service/points.service";

const grantPointsByBiz = vi.spyOn(PointsService, "grantPointsByBiz");
const admin = { id: "adm1", username: "admin" };

describe("unit: FeedbackService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    grantPointsByBiz.mockReset();
    grantPointsByBiz.mockResolvedValue({ points: 150 } as never);
    await PointsService.ensureRulesDocumentExists();
  });

  it("createFeedback / rate limit / list / unread / mark read", async () => {
    const { userId } = await seedUser({ userId: "fb-u1", points: 100 });
    expect((await FeedbackService.getFeedbackRewardRulesPublic()).criticalMax).toBeGreaterThan(0);
    expect((await FeedbackService.getWeeklyFirstRewardStatus(userId)).granted).toBe(false);

    const created = await FeedbackService.createFeedback({
      userId,
      type: "demand",
      content: "希望增加导出功能多一点字",
      contact: "a@b.com",
      images: ["https://x/1.png", ""],
      clientMeta: { platform: "h5" },
    });
    expect(created.feedback.id).toBeTruthy();
    expect(created.awardedWeeklyPoints).toBeGreaterThan(0);

    await expect(
      FeedbackService.createFeedback({
        userId,
        type: "bug",
        content: "第二条太快了第二条太快了",
      }),
    ).rejects.toBeInstanceOf(FeedbackRateLimitError);

    await UserFeedback.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(created.feedback.id) },
      { $set: { createdAt: new Date(Date.now() - 120_000) } },
    );
    const second = await FeedbackService.createFeedback({
      userId,
      type: "bug",
      content: "第二条反馈内容足够长了",
    });
    expect(second.awardedWeeklyPoints).toBe(0);
    expect((await FeedbackService.getMyFeedbackList(userId, { page: 1, pageSize: 10 })).total).toBe(
      2,
    );

    await FeedbackService.adminReviewFeedback(
      created.feedback.id,
      { reviewLevel: "important", userReply: "已安排" },
      admin,
    );
    expect((await FeedbackService.getUnreadReplySummary(userId)).unreadCount).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      (await FeedbackService.getMyFeedbackDetail(userId, created.feedback.id))?.hasUnreadReply,
    ).toBe(true);
    await FeedbackService.markReplyRead(userId, created.feedback.id);
    expect((await FeedbackService.getUnreadReplySummary(userId)).unreadCount).toBe(0);
    await FeedbackService.adminUpdateUserReply(
      created.feedback.id,
      { userReply: "更新回复" },
      admin,
    );
    await FeedbackService.markAllRepliesRead(userId);
  });

  it("admin list/filter/review/batch/export/next", async () => {
    const { userId } = await seedUser({ userId: "fb-admin", points: 50 });
    const docs = [];
    for (let i = 0; i < 3; i++) {
      docs.push(
        await UserFeedback.create({
          userId,
          type: i === 0 ? "bug" : "demand",
          content: `反馈内容编号${i}足够长`,
          status: "pending",
          createdAt: new Date(Date.now() - (3 - i) * 60_000),
        }),
      );
    }
    expect(
      (
        await FeedbackService.adminListFeedbacks({
          page: 1,
          limit: 10,
          status: "pending",
          type: "bug",
          keyword: "编号0",
          userId,
        })
      ).total,
    ).toBe(1);
    expect((await FeedbackService.adminGetFeedback(String(docs[0]._id)))?.content).toContain(
      "编号0",
    );
    expect(await FeedbackService.adminGetFeedback("bad-id")).toBeNull();

    await FeedbackService.adminReviewFeedback(
      String(docs[0]._id),
      { reviewLevel: "critical", reviewRemark: "关键", rewardPoints: 100 },
      admin,
    );
    expect((await UserFeedback.findById(docs[0]._id).lean())?.reviewRewardPointsGranted).toBe(100);
    await FeedbackService.adminReviewFeedback(
      String(docs[0]._id),
      { reviewLevel: "trash" },
      admin,
    );

    const batch = await FeedbackService.adminBatchReviewFeedbacks(
      [String(docs[1]._id), String(docs[2]._id), "bad"],
      { reviewLevel: "normal" },
      admin,
    );
    expect(batch.successCount).toBe(2);
    expect(batch.failedCount).toBe(1);

    await UserFeedback.updateOne({ _id: docs[1]._id }, { $set: { status: "pending" } });
    expect(
      typeof (await FeedbackService.adminNextPendingFeedbackId(String(docs[0]._id), "next")),
    ).toBe("string");
    expect(
      typeof (await FeedbackService.adminNextPendingFeedbackId(String(docs[2]._id), "prev")),
    ).toBe("string");

    const exported = await FeedbackService.adminExportFeedbacksCsv({
      query: { status: "reviewed", userId },
      limit: 50,
    });
    expect(exported.csv).toContain("反馈ID");
    expect(exported.exportedCount).toBeGreaterThan(0);
    expect(
      (
        await FeedbackService.adminExportFeedbacksCsv({
          ids: [String(docs[0]._id), ""],
          limit: 10,
        })
      ).exportedCount,
    ).toBe(1);
  });
});
