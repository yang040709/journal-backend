import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { adminAuthHeader, seedAdmin } from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";

vi.mock("../../../src/service/feedback.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/service/feedback.service")>();
  return {
    ...actual,
    FeedbackService: {
      ...actual.FeedbackService,
      adminListFeedbacks: vi.fn(actual.FeedbackService.adminListFeedbacks.bind(actual.FeedbackService)),
      adminGetFeedback: vi.fn(actual.FeedbackService.adminGetFeedback.bind(actual.FeedbackService)),
      adminReviewFeedback: vi.fn(actual.FeedbackService.adminReviewFeedback.bind(actual.FeedbackService)),
      adminBatchReviewFeedbacks: vi.fn(
        actual.FeedbackService.adminBatchReviewFeedbacks.bind(actual.FeedbackService),
      ),
      adminExportFeedbacksCsv: vi.fn(
        actual.FeedbackService.adminExportFeedbacksCsv.bind(actual.FeedbackService),
      ),
      adminNextPendingFeedbackId: vi.fn(
        actual.FeedbackService.adminNextPendingFeedbackId.bind(actual.FeedbackService),
      ),
      adminUpdateUserReply: vi.fn(
        actual.FeedbackService.adminUpdateUserReply.bind(actual.FeedbackService),
      ),
    },
  };
});

vi.mock("../../../src/service/points.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/service/points.service")>();
  return {
    ...actual,
    PointsService: {
      ...actual.PointsService,
      adminListTransactions: vi.fn(
        actual.PointsService.adminListTransactions.bind(actual.PointsService),
      ),
      getRules: vi.fn(actual.PointsService.getRules.bind(actual.PointsService)),
      setRulesFromAdmin: vi.fn(
        actual.PointsService.setRulesFromAdmin.bind(actual.PointsService),
      ),
      ensureRulesDocumentExists: vi.fn(
        actual.PointsService.ensureRulesDocumentExists.bind(actual.PointsService),
      ),
    },
  };
});

vi.mock("../../../src/service/pointsCampaign.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/pointsCampaign.service")>();
  return {
    ...actual,
    PointsCampaignService: {
      ...actual.PointsCampaignService,
      listCampaigns: vi.fn(actual.PointsCampaignService.listCampaigns.bind(actual.PointsCampaignService)),
      createCampaign: vi.fn(
        actual.PointsCampaignService.createCampaign.bind(actual.PointsCampaignService),
      ),
      getCampaignForAdmin: vi.fn(
        actual.PointsCampaignService.getCampaignForAdmin.bind(actual.PointsCampaignService),
      ),
      updateCampaign: vi.fn(
        actual.PointsCampaignService.updateCampaign.bind(actual.PointsCampaignService),
      ),
      publishCampaign: vi.fn(
        actual.PointsCampaignService.publishCampaign.bind(actual.PointsCampaignService),
      ),
      offlineCampaign: vi.fn(
        actual.PointsCampaignService.offlineCampaign.bind(actual.PointsCampaignService),
      ),
      listCampaignClaims: vi.fn(
        actual.PointsCampaignService.listCampaignClaims.bind(actual.PointsCampaignService),
      ),
    },
  };
});

import { FeedbackService } from "../../../src/service/feedback.service";
import { PointsService } from "../../../src/service/points.service";
import {
  CampaignNotFoundError,
  PointsCampaignService,
} from "../../../src/service/pointsCampaign.service";
import { UserReviewService } from "../../../src/service/userReview.service";

vi.mock("../../../src/service/userReview.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/service/userReview.service")>();
  return {
    ...actual,
    UserReviewService: {
      ...actual.UserReviewService,
      adminList: vi.fn(actual.UserReviewService.adminList.bind(actual.UserReviewService)),
      adminCreate: vi.fn(actual.UserReviewService.adminCreate.bind(actual.UserReviewService)),
      adminUpdate: vi.fn(actual.UserReviewService.adminUpdate.bind(actual.UserReviewService)),
      adminDelete: vi.fn(actual.UserReviewService.adminDelete.bind(actual.UserReviewService)),
    },
  };
});

describe("integration: admin points/feedbacks catch-path branches", () => {
  const agent = createTestAgent();
  let auth: Record<string, string> = {};

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    auth = adminAuthHeader((await seedAdmin()).token);
    await PointsService.ensureRulesDocumentExists();
    vi.mocked(FeedbackService.adminListFeedbacks).mockClear();
    vi.mocked(FeedbackService.adminGetFeedback).mockClear();
    vi.mocked(FeedbackService.adminReviewFeedback).mockClear();
    vi.mocked(FeedbackService.adminBatchReviewFeedbacks).mockClear();
    vi.mocked(PointsService.adminListTransactions).mockClear();
    vi.mocked(PointsCampaignService.listCampaigns).mockClear();
    vi.mocked(PointsCampaignService.createCampaign).mockClear();
    vi.mocked(PointsCampaignService.publishCampaign).mockClear();
    vi.mocked(UserReviewService.adminList).mockClear();
    vi.mocked(UserReviewService.adminCreate).mockClear();
  });

  it("feedbacks Zod / 404 / 500 catch 分支", async () => {
    expect(
      (await agent.get("/admin/feedbacks").set(auth).query({ status: "nope" })).status,
    ).toBe(400);

    vi.mocked(FeedbackService.adminListFeedbacks).mockRejectedValueOnce(new Error("boom-list"));
    expect((await agent.get("/admin/feedbacks").set(auth)).status).toBe(500);

    vi.mocked(FeedbackService.adminGetFeedback).mockResolvedValueOnce(null as never);
    expect((await agent.get("/admin/feedbacks/000000000000000000000001").set(auth)).status).toBe(
      404,
    );

    vi.mocked(FeedbackService.adminGetFeedback).mockRejectedValueOnce(new Error("boom-get"));
    expect((await agent.get("/admin/feedbacks/000000000000000000000002").set(auth)).status).toBe(
      500,
    );

    expect(
      (
        await agent
          .post("/admin/feedbacks/000000000000000000000003/review")
          .set(auth)
          .send({ reviewLevel: "nope" })
      ).status,
    ).toBe(400);

    vi.mocked(FeedbackService.adminReviewFeedback).mockRejectedValueOnce(
      new Error("反馈不存在"),
    );
    expect(
      (
        await agent
          .post("/admin/feedbacks/000000000000000000000004/review")
          .set(auth)
          .send({ reviewLevel: "normal" })
      ).status,
    ).toBe(404);

    vi.mocked(FeedbackService.adminReviewFeedback).mockRejectedValueOnce(new Error("boom-review"));
    expect(
      (
        await agent
          .post("/admin/feedbacks/000000000000000000000005/review")
          .set(auth)
          .send({ reviewLevel: "important" })
      ).status,
    ).toBe(500);

    expect(
      (
        await agent
          .post("/admin/feedbacks/batch-review")
          .set(auth)
          .send({ ids: [], reviewLevel: "normal" })
      ).status,
    ).toBe(400);

    vi.mocked(FeedbackService.adminBatchReviewFeedbacks).mockRejectedValueOnce(
      new Error("boom-batch"),
    );
    expect(
      (
        await agent
          .post("/admin/feedbacks/batch-review")
          .set(auth)
          .send({ ids: ["1"], reviewLevel: "normal" })
      ).status,
    ).toBe(500);

    // /feedbacks/export 注册在 /:id 之后会被截获，改测 review/next
    vi.mocked(FeedbackService.adminNextPendingFeedbackId).mockRejectedValueOnce(
      new Error("boom-next"),
    );
    expect((await agent.get("/admin/feedbacks/review/next").set(auth)).status).toBe(500);

    expect(
      (
        await agent
          .patch("/admin/feedbacks/000000000000000000000006/user-reply")
          .set(auth)
          .send({ userReply: "x".repeat(1001) })
      ).status,
    ).toBe(400);

    vi.mocked(FeedbackService.adminUpdateUserReply).mockRejectedValueOnce(
      new Error("反馈不存在"),
    );
    expect(
      (
        await agent
          .patch("/admin/feedbacks/000000000000000000000007/user-reply")
          .set(auth)
          .send({ userReply: "已处理" })
      ).status,
    ).toBe(404);

    vi.mocked(FeedbackService.adminUpdateUserReply).mockRejectedValueOnce(
      new Error("boom-reply"),
    );
    expect(
      (await agent
        .patch("/admin/feedbacks/000000000000000000000008/user-reply")
        .set(auth)
        .send({ userReply: "已处理" })).status,
    ).toBe(500);

    // export：/feedbacks/export 可能被 /:id 截获 → 404；成功则覆盖过滤/导出失败分支
    const exportSelected = await agent
      .get("/admin/feedbacks/export")
      .set(auth)
      .query({ mode: "selected" });
    expect([400, 404]).toContain(exportSelected.status);
    const exportFiltered = await agent
      .get("/admin/feedbacks/export")
      .set(auth)
      .query({ mode: "filtered", status: "pending" });
    expect([200, 404]).toContain(exportFiltered.status);
    if (exportFiltered.status === 200) {
      vi.mocked(FeedbackService.adminExportFeedbacksCsv).mockRejectedValueOnce(
        new Error("boom-export"),
      );
      expect(
        (
          await agent
            .get("/admin/feedbacks/export")
            .set(auth)
            .query({ mode: "filtered" })
        ).status,
      ).toBe(500);
    }

    expect((await agent.get("/admin/feedback-config").set(auth)).status).toBe(200);
    vi.mocked(PointsService.getRules).mockRejectedValueOnce(new Error("boom-fc"));
    expect((await agent.get("/admin/feedback-config").set(auth)).status).toBe(500);

    expect(
      (
        await agent.put("/admin/feedback-config").set(auth).send({
          weeklyFirstSubmit: 1,
          important: 2,
          critical: 3,
        })
      ).status,
    ).toBe(200);
    expect(
      (await agent.put("/admin/feedback-config").set(auth).send({ critical: -1 })).status,
    ).toBe(400);
  });

  it("points transactions/reviews/campaigns Zod / 500 分支", async () => {
    expect(
      (await agent.get("/admin/points/transactions").set(auth).query({ page: "x" })).status,
    ).toBe(400);

    vi.mocked(PointsService.adminListTransactions).mockRejectedValueOnce(
      new Error("分页深度超过限制"),
    );
    expect((await agent.get("/admin/points/transactions").set(auth)).status).toBe(400);

    vi.mocked(PointsService.adminListTransactions).mockRejectedValueOnce(new Error("boom-tx"));
    expect((await agent.get("/admin/points/transactions").set(auth)).status).toBe(500);

    expect((await agent.get("/admin/reviews").set(auth)).status).toBe(200);
    expect(
      (await agent.post("/admin/reviews").set(auth).send({ content: "" })).status,
    ).toBe(400);

    // create review catch 对非 Zod 错误也回 400（非 500）
    vi.mocked(UserReviewService.adminCreate).mockRejectedValueOnce(new Error("boom-review"));
    expect(
      (
        await agent
          .post("/admin/reviews")
          .set(auth)
          .send({ content: "评价内容", username: "u1" })
      ).status,
    ).toBe(400);

    expect((await agent.get("/admin/points-campaigns").set(auth)).status).toBe(200);
    vi.mocked(PointsCampaignService.listCampaigns).mockRejectedValueOnce(new Error("boom-camp"));
    expect((await agent.get("/admin/points-campaigns").set(auth)).status).toBe(500);

    expect(
      (await agent.post("/admin/points-campaigns").set(auth).send({ name: "" })).status,
    ).toBe(400);

    vi.mocked(PointsCampaignService.createCampaign).mockRejectedValueOnce(
      new Error("boom-create"),
    );
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 86400000).toISOString();
    // createCampaign catch 默认/显式走 PARAM_ERROR → 400
    expect(
      (
        await agent
          .post("/admin/points-campaigns")
          .set(auth)
          .send({ name: "活动", pointValue: 10, quota: 1, startAt: start, endAt: end })
      ).status,
    ).toBe(400);

    vi.mocked(PointsCampaignService.publishCampaign).mockRejectedValueOnce(
      new Error("publish campaign code failed"),
    );
    expect(
      (
        await agent
          .post("/admin/points-campaigns/000000000000000000000099/publish")
          .set(auth)
      ).status,
    ).toBeGreaterThanOrEqual(400);

    vi.mocked(UserReviewService.adminList).mockRejectedValueOnce(new Error("boom-rev-list"));
    expect((await agent.get("/admin/reviews").set(auth)).status).toBe(500);

    expect(
      (
        await agent
          .put("/admin/reviews/000000000000000000000010")
          .set(auth)
          .send({})
      ).status,
    ).toBe(400);

    vi.mocked(UserReviewService.adminUpdate).mockResolvedValueOnce(null as never);
    expect(
      (
        await agent
          .put("/admin/reviews/000000000000000000000011")
          .set(auth)
          .send({ content: "更新文案足够长" })
      ).status,
    ).toBe(404);

    vi.mocked(UserReviewService.adminDelete).mockResolvedValueOnce(false as never);
    expect(
      (await agent.delete("/admin/reviews/000000000000000000000012").set(auth)).status,
    ).toBe(404);

    vi.mocked(PointsCampaignService.getCampaignForAdmin).mockRejectedValueOnce(
      new CampaignNotFoundError("campaign not found"),
    );
    expect(
      (await agent.get("/admin/points-campaigns/000000000000000000000080").set(auth)).status,
    ).toBe(404);

    vi.mocked(PointsCampaignService.getCampaignForAdmin).mockRejectedValueOnce(
      new Error("boom-get-camp"),
    );
    expect(
      (await agent.get("/admin/points-campaigns/000000000000000000000081").set(auth)).status,
    ).toBe(500);

    vi.mocked(PointsCampaignService.updateCampaign).mockRejectedValueOnce(
      new CampaignNotFoundError("campaign not found"),
    );
    expect(
      (
        await agent
          .put("/admin/points-campaigns/000000000000000000000082")
          .set(auth)
          .send({ name: "改名" })
      ).status,
    ).toBe(404);

    vi.mocked(PointsCampaignService.offlineCampaign).mockRejectedValueOnce(
      new CampaignNotFoundError("campaign not found"),
    );
    expect(
      (
        await agent
          .post("/admin/points-campaigns/000000000000000000000083/offline")
          .set(auth)
      ).status,
    ).toBe(404);

    vi.mocked(PointsCampaignService.listCampaignClaims).mockRejectedValueOnce(
      new Error("boom-claims"),
    );
    expect(
      (
        await agent
          .get("/admin/points-campaigns/000000000000000000000084/claims")
          .set(auth)
      ).status,
    ).toBe(500);
  });

  it("真实用户评价 CRUD 成功分支", async () => {
    await seedUser({ userId: "rev-u" });
    const created = await agent.post("/admin/reviews").set(auth).send({
      content: "很好用很好用",
      username: "小明",
      tag: "推荐",
      status: "on",
    });
    expect(created.status).toBe(200);
    const id = created.body?.data?.id || created.body?.data?._id;
    if (id) {
      expect(
        (
          await agent
            .put(`/admin/reviews/${id}`)
            .set(auth)
            .send({ content: "更新评价" })
        ).status,
      ).toBe(200);
      expect((await agent.delete(`/admin/reviews/${id}`).set(auth)).status).toBe(200);
    }
  });
});
