import { describe, expect, it } from "vitest";
import {
  loginSchema,
  paginationSchema,
  tagsQuery,
  booleanQueryParam,
  noteListQuerySchema,
  riskNoteListQuerySchema,
  trashNoteListQuerySchema,
  userListQuerySchema,
  feedbackListQuerySchema,
  feedbackReviewBodySchema,
  feedbackBatchReviewBodySchema,
  feedbackNextQuerySchema,
  batchIdsSchema,
  createNoteSchema,
  updateNoteSchema,
  createUserSchema,
  updateUserSchema,
  adminPointsRulesPutSchema,
  announcementCreateBodySchema,
  pointsCampaignCreateSchema,
  pointsCampaignListQuerySchema,
  aiStyleCreateSchema,
  batchShareBodySchema,
  batchTagsBodySchema,
  adminGalleryCosStsSchema,
  adminGalleryRecordSchema,
  adminReviewCreateSchema,
  userMigrationPrecheckSchema,
  userMigrationExecuteSchema,
  templateListQuerySchema,
  reminderListQuerySchema,
  operationsReportQuerySchema,
  clientEventStatsQuerySchema,
  readingThemeStatsQuerySchema,
  adminQuotaBaseLimitsPutSchema,
  adminNotebookLimitsPutSchema,
  adminExportSettingsPutSchema,
  createNoteBookSchema,
  updateNoteBookSchema,
  importNotebookJsonSchema,
  alertRuleUpdateSchema,
  alertEventAckSchema,
  aiStylePreviewSchema,
  aiStyleEnableSchema,
  feedbackQuickRepliesBodySchema,
  adminInitialNotesPutSchema,
  adminInitialNotebooksPutSchema,
  adminNotePresetTagsPutSchema,
  adminBrowseBannersPutSchema,
  adminSystemCoversPutSchema,
  adminQuickCoversBodySchema,
  noteExportLogQuerySchema,
  pointsRuleLogQuerySchema,
  adminImageAssetsListQuerySchema,
  activitySummaryQuerySchema,
  quotaDailyListQuerySchema,
} from "../../../src/routes/admin/admin.schemas";

describe("unit: admin.schemas branch coverage", () => {
  it("loginSchema / paginationSchema / refine 深度限制", () => {
    expect(loginSchema.safeParse({ username: "a", password: "b" }).success).toBe(true);
    expect(loginSchema.safeParse({ username: "", password: "b" }).success).toBe(false);
    expect(paginationSchema.parse({})).toMatchObject({ page: 1, limit: 20 });
    expect(paginationSchema.safeParse({ page: 1000, limit: 100 }).success).toBe(false);
  });

  it("tagsQuery / booleanQueryParam preprocess 分支", () => {
    expect(tagsQuery.parse(null)).toBeUndefined();
    expect(tagsQuery.parse("")).toBeUndefined();
    expect(tagsQuery.parse([" a ", "", "b"])).toEqual(["a", "b"]);
    expect(tagsQuery.parse("x, y ,")).toEqual(["x", "y"]);
    expect(tagsQuery.parse(123)).toBeUndefined();
    expect(booleanQueryParam.parse(undefined)).toBeUndefined();
    expect(booleanQueryParam.parse("")).toBeUndefined();
    expect(booleanQueryParam.parse("true")).toBe(true);
    expect(booleanQueryParam.parse(true)).toBe(true);
    expect(booleanQueryParam.parse("false")).toBe(false);
    expect(booleanQueryParam.parse(false)).toBe(false);
    expect(booleanQueryParam.parse("maybe")).toBeUndefined();
  });

  it("note/risk/trash/user list query schemas", () => {
    expect(
      noteListQuerySchema.parse({
        tags: "a,b",
        isShare: "true",
        isFavorite: "false",
        q: "关键词足够长",
      }),
    ).toMatchObject({ isShare: true, isFavorite: false });
    expect(riskNoteListQuerySchema.parse({ riskStatus: "reject_local" }).riskStatus).toBe(
      "reject_local",
    );
    expect(riskNoteListQuerySchema.safeParse({ riskStatus: "nope" }).success).toBe(false);
    expect(trashNoteListQuerySchema.parse({ includeExpired: "true" }).includeExpired).toBe(true);
    expect(userListQuerySchema.parse({ userId: "u1" }).userId).toBe("u1");
  });

  it("feedback schemas 审核/批量/翻页", () => {
    expect(feedbackListQuerySchema.parse({ status: "pending", type: "bug" })).toMatchObject({
      status: "pending",
    });
    expect(
      feedbackReviewBodySchema.parse({
        reviewLevel: "critical",
        reviewRemark: "ok",
        rewardPoints: 10,
      }),
    ).toMatchObject({ reviewLevel: "critical" });
    expect(
      feedbackReviewBodySchema.safeParse({
        reviewLevel: "normal",
        rewardPoints: 1,
      }).success,
    ).toBe(false);
    expect(batchIdsSchema.parse(["a", "b"])).toHaveLength(2);
    expect(batchIdsSchema.safeParse([]).success).toBe(false);
    expect(
      feedbackBatchReviewBodySchema.parse({
        ids: ["1"],
        reviewLevel: "normal",
      }),
    ).toBeTruthy();
    expect(feedbackNextQuerySchema.parse({ direction: "prev" }).direction).toBe("prev");
    expect(feedbackNextQuerySchema.parse({}).direction).toBe("next");
  });

  it("note/user/announcement/points 写操作 schemas", () => {
    expect(
      createNoteSchema.parse({
        userId: "u",
        noteBookId: "nb",
        title: "t",
        content: "c",
      }),
    ).toBeTruthy();
    expect(updateNoteSchema.parse({ title: "x" }).title).toBe("x");
    expect(createUserSchema.parse({ userId: "u1" }).userId).toBe("u1");
    expect(
      updateUserSchema.parse({ points: 1, pointsAdjustReason: "人工调整" }),
    ).toMatchObject({ points: 1 });
    expect(updateUserSchema.safeParse({ points: 1 }).success).toBe(false);
    expect(
      announcementCreateBodySchema.parse({
        title: "公告",
        content: "内容",
        status: "published",
      }),
    ).toBeTruthy();
    expect(
      adminPointsRulesPutSchema.parse({
        pointsPerAd: 5,
        feedbackRewards: { weeklyFirstSubmit: 1, important: 2, critical: 10 },
        uploadExchange: { enabled: true, pointsCost: 10, quotaGain: 1 },
      }),
    ).toBeTruthy();
  });

  it("campaign / aiStyle / gallery / review / migration schemas", () => {
    const start = new Date();
    const end = new Date(Date.now() + 86400000);
    expect(
      pointsCampaignCreateSchema.parse({
        name: "活动",
        pointValue: 10,
        quota: 5,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      }),
    ).toBeTruthy();
    expect(
      pointsCampaignCreateSchema.safeParse({
        name: "活动",
        pointValue: 10,
        quota: 5,
        startAt: end.toISOString(),
        endAt: start.toISOString(),
      }).success,
    ).toBe(false);
    expect(pointsCampaignListQuerySchema.parse({ status: "draft" }).status).toBe("draft");
    expect(
      aiStyleCreateSchema.parse({
        styleKey: "s1",
        name: "风格",
        systemPrompt: "sys",
        userPromptTemplate: "user {{content}}",
        modePrompts: { generate: "a", rewrite: "b", continue: "c" },
      }),
    ).toBeTruthy();
    expect(batchShareBodySchema.parse({ noteIds: ["1"], isShare: true })).toBeTruthy();
    expect(batchTagsBodySchema.parse({ noteIds: ["1"], tags: ["t"], mode: "add" })).toBeTruthy();
    expect(
      adminGalleryCosStsSchema.parse({
        biz: "system_cover",
        fileName: "a.png",
        fileType: "image/png",
        fileSize: 100,
      }),
    ).toBeTruthy();
    expect(
      adminGalleryRecordSchema.parse({
        url: "https://x/a.png",
        storageKey: "k/a.png",
        mimeType: "image/png",
        size: 1,
        width: 1,
        height: 1,
        biz: "system_cover",
      }),
    ).toBeTruthy();
    expect(
      adminReviewCreateSchema.parse({
        content: "好评内容",
        username: "u",
        tag: "热",
      }),
    ).toBeTruthy();
    expect(
      userMigrationPrecheckSchema.parse({
        sourceOpenid: "a",
        targetOpenid: "b",
        remark: "r",
        operator: "op",
      }),
    ).toBeTruthy();
    expect(
      userMigrationExecuteSchema.parse({
        sourceOpenid: "a",
        targetOpenid: "b",
        remark: "r",
        operator: "op",
        idempotencyKey: "idempotency-key-1",
      }),
    ).toBeTruthy();
  });

  it("template/reminder/stats query schemas defaults 与失败分支", () => {
    expect(templateListQuerySchema.parse({}).page).toBe(1);
    expect(reminderListQuerySchema.parse({ sendStatus: "pending" })).toBeTruthy();
    expect(
      operationsReportQuerySchema.parse({
        startDate: "2026-01-01",
        endDate: "2026-01-07",
      }),
    ).toBeTruthy();
    expect(
      operationsReportQuerySchema.safeParse({
        startDate: "2026-01-10",
        endDate: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(clientEventStatsQuerySchema.parse({ days: 7 }).days).toBe(7);
    expect(readingThemeStatsQuerySchema.parse({ days: 7 }).days).toBe(7);
    expect(clientEventStatsQuerySchema.safeParse({ days: 99999 }).success).toBe(false);
  });

  it("quota/limit/export/notebook/import schemas", () => {
    expect(adminQuotaBaseLimitsPutSchema.parse({ uploadDailyBaseLimit: 5 })).toBeTruthy();
    expect(
      adminNotebookLimitsPutSchema.parse({ defaultMaxNoteBookCount: 10 }),
    ).toBeTruthy();
    expect(
      adminExportSettingsPutSchema.parse({ exportWeeklyFreeCount: 2 }),
    ).toBeTruthy();
    expect(createNoteBookSchema.parse({ title: "本", userId: "u" })).toBeTruthy();
    expect(updateNoteBookSchema.parse({ title: "本2" })).toBeTruthy();
    expect(
      importNotebookJsonSchema.parse({
        userId: "u1",
        data: { version: "1.0.0", type: "notebook_migration" },
      }),
    ).toBeTruthy();
  });

  it("alert/aiStyle/feedbackQuick/config put schemas", () => {
    expect(alertRuleUpdateSchema.parse({ enabled: true, severity: "P1" })).toBeTruthy();
    expect(alertEventAckSchema.parse({ remark: "ok" })).toBeTruthy();
    expect(aiStyleEnableSchema.parse({ enabled: false })).toBeTruthy();
    expect(
      aiStylePreviewSchema.parse({ mode: "generate", content: "hello" }),
    ).toBeTruthy();
    expect(
      feedbackQuickRepliesBodySchema.parse({
        items: [{ label: "a", content: "b" }],
      }),
    ).toBeTruthy();
    expect(adminNotePresetTagsPutSchema.parse({ tags: ["日常"] })).toBeTruthy();
    expect(
      adminSystemCoversPutSchema.parse({ coverUrls: ["https://x/a.png"] }),
    ).toBeTruthy();
    expect(adminQuickCoversBodySchema.parse({ covers: ["https://x/a.png"] })).toBeTruthy();
    expect(
      adminBrowseBannersPutSchema.parse({
        items: [
          {
            imageUrl: "https://x/b.png",
            type: "none",
            priority: 1,
            enabled: true,
          },
        ],
      }),
    ).toBeTruthy();
    expect(
      adminInitialNotebooksPutSchema.parse({
        templates: [{ title: "默认", coverImg: "c.png" }],
      }),
    ).toBeTruthy();
    expect(
      adminInitialNotesPutSchema.parse({
        templates: [
          {
            title: "欢迎",
            content: "内容",
            targetIndex: 0,
            seedKey: "welcome",
          },
        ],
      }),
    ).toBeTruthy();
  });

  it("list query extras", () => {
    expect(trashNoteListQuerySchema.parse({ includeExpired: "false" })).toBeTruthy();
    expect(noteExportLogQuerySchema.parse({ page: 1 })).toBeTruthy();
    expect(pointsRuleLogQuerySchema.parse({ page: 1 })).toBeTruthy();
    expect(adminImageAssetsListQuerySchema.parse({ source: "note" })).toBeTruthy();
    expect(activitySummaryQuerySchema.parse({ days: 7 })).toBeTruthy();
    expect(quotaDailyListQuerySchema.parse({ dateKeyFrom: "2026-07-15" })).toBeTruthy();
  });
});
