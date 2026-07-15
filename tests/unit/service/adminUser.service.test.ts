import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import User from "../../../src/model/User";
import Activity from "../../../src/model/Activity";
import UserAiUsageDaily from "../../../src/model/UserAiUsageDaily";
import { AdminUserService } from "../../../src/service/adminUser.service";
import { getQuotaDateContext } from "../../../src/utils/dateKey";

vi.mock("../../../src/service/user.service", () => ({
  UserService: {
    createDefaultNoteBooks: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../src/service/points.service", () => ({
  PointsService: {
    adminSetPoints: vi.fn(async (userId: string, points: number) => {
      await User.updateOne({ userId }, { $set: { points } });
    }),
  },
}));

describe("unit: AdminUserService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("buildHealthScoreSummary 覆盖高低分分支", () => {
    const low = AdminUserService.buildHealthScoreSummary({
      activityCount7d: 0,
      noteCount30d: 0,
      feedbackPending: 2,
      feedbackImportantPending: 1,
      riskRejectCount30d: 1,
      riskSuspiciousCount30d: 0,
      pointsIncome30d: 0,
      pointsExpense30d: 0,
    });
    expect(low.level).toBe("D");
    expect(low.reasons.length).toBeGreaterThan(0);

    const mid = AdminUserService.buildHealthScoreSummary({
      activityCount7d: 5,
      noteCount30d: 5,
      feedbackPending: 1,
      feedbackImportantPending: 0,
      riskRejectCount30d: 0,
      riskSuspiciousCount30d: 2,
      pointsIncome30d: 10,
      pointsExpense30d: 0,
    });
    expect(["B", "C", "D"]).toContain(mid.level);

    const high = AdminUserService.buildHealthScoreSummary({
      activityCount7d: 25,
      noteCount30d: 20,
      feedbackPending: 0,
      feedbackImportantPending: 0,
      riskRejectCount30d: 0,
      riskSuspiciousCount30d: 0,
      pointsIncome30d: 10,
      pointsExpense30d: 5,
    });
    expect(high.level).toBe("A");
    expect(high.total).toBeGreaterThanOrEqual(80);
  });

  it("list/get/jwt/activity/overview/create/update/delete", async () => {
    const { userId } = await seedUser({ userId: "admin-user-1", points: 120 });
    const user = await User.findOneAndUpdate(
      { userId },
      { $set: { aiBonusQuota: 2, uploadExtraQuotaTotal: 3 } },
      { new: true },
    ).lean();
    const mongoId = String(user!._id);
    const { dateKey } = getQuotaDateContext();
    await UserAiUsageDaily.create({ userId, dateKey, usedCount: 1 });
    const book = await seedNoteBook(userId);
    await seedNote({ userId, noteBookId: book.id, title: "概览笔记" });
    await Activity.create({
      userId,
      type: "create",
      target: "note",
      targetId: "n1",
      title: "创建笔记",
    });

    expect(AdminUserService.decodeBizUserIdParam("")).toBe("");
    expect(AdminUserService.decodeBizUserIdParam(encodeURIComponent(userId))).toBe(
      userId,
    );
    expect(
      await AdminUserService.resolveMongoIdFromBizUserRouteParam(userId),
    ).toBe(mongoId);
    expect(
      await AdminUserService.resolveMongoIdFromBizUserRouteParam("missing"),
    ).toBeNull();

    const jwt = await AdminUserService.generateUserJwtByBizUserId(userId);
    expect(jwt?.bearerToken.startsWith("Bearer ")).toBe(true);
    expect(await AdminUserService.generateUserJwtByBizUserId("")).toBeNull();

    const listed = await AdminUserService.listUsers(
      1,
      10,
      userId,
      Date.now() - 86_400_000,
      Date.now() + 86_400_000,
    );
    expect(listed.total).toBe(1);
    expect(listed.items[0].aiUsedToday).toBe(1);

    expect((await AdminUserService.getUserById(mongoId))?.userId).toBe(userId);
    expect(
      await AdminUserService.getUserById("000000000000000000000000"),
    ).toBeNull();
    expect((await AdminUserService.getUserByUserId(userId))?.points).toBe(120);

    const acts = await AdminUserService.listUserActivities(mongoId, {
      page: 1,
      limit: 10,
      type: "create",
      target: "note",
    });
    expect(acts?.total).toBe(1);
    expect(
      await AdminUserService.listUserActivities("000000000000000000000000", {
        page: 1,
        limit: 10,
      }),
    ).toBeNull();

    const allActs = await AdminUserService.listAllActivities({
      page: 1,
      limit: 10,
      userId,
      type: "create",
    });
    expect(allActs.total).toBe(1);

    const summary = await AdminUserService.getActivityTypeSummary({
      days: 7,
      userId,
      target: "note",
    });
    expect(summary.counts.create).toBe(1);

    const overview = await AdminUserService.getUserOverview(mongoId);
    expect(overview?.contentSummary.totalNotes).toBe(1);
    expect(overview?.healthScore.total).toBeGreaterThanOrEqual(0);
    expect(
      await AdminUserService.getUserOverview("000000000000000000000000"),
    ).toBeNull();

    const created = await AdminUserService.createUser({
      userId: "admin-user-created",
      initDefaultNoteBooks: false,
    });
    expect(created.userId).toBe("admin-user-created");
    await expect(
      AdminUserService.createUser({ userId: "admin-user-created" }),
    ).rejects.toThrow(/已存在/);

    const updated = await AdminUserService.updateUser(
      String(created._id),
      {
        aiBonusQuota: 5,
        uploadExtraQuotaTotal: 6,
        points: 300,
        pointsAdjustReason: "单测调分",
        adRewardDailyLimit: 3,
      },
      { id: "a1", username: "admin" },
    );
    expect(updated?.aiBonusQuota).toBe(5);
    expect(updated?.points).toBe(300);

    const cleared = await AdminUserService.updateUser(
      String(created._id),
      { adRewardDailyLimit: null },
      { id: "a1", username: "admin" },
    );
    expect(cleared?.adRewardDailyLimit == null).toBe(true);

    expect(await AdminUserService.deleteUserById(String(created._id))).toBe(true);
    expect(
      await AdminUserService.deleteUserById("000000000000000000000000"),
    ).toBe(false);
  });
});
