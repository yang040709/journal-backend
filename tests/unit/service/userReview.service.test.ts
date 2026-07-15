import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { UserReviewService } from "../../../src/service/userReview.service";

describe("unit: UserReviewService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("公开列表仅 on；admin CRUD 完整", async () => {
    const a = await UserReviewService.adminCreate({
      content: "很好用",
      username: "小明",
      tag: "好物",
      imageUrl: " https://cdn.example/a.png ",
      status: "on",
      sortOrder: 10,
    });
    const b = await UserReviewService.adminCreate({
      content: "草稿",
      username: "小红",
      status: "off",
      sortOrder: 1,
    });

    const pub = await UserReviewService.listPublic({ page: 1, pageSize: 10 });
    expect(pub.total).toBe(1);
    expect(pub.items[0].id).toBe(a.id);
    expect(pub.hasMore).toBe(false);

    const adminAll = await UserReviewService.adminList({ page: 1, limit: 20 });
    expect(adminAll.total).toBe(2);
    const offOnly = await UserReviewService.adminList({
      page: 1,
      limit: 20,
      status: "off",
    });
    expect(offOnly.total).toBe(1);
    expect(offOnly.items[0].id).toBe(b.id);

    const updated = await UserReviewService.adminUpdate(a.id, {
      content: "更好用",
      username: "小明2",
      tag: "推荐",
      imageUrl: "",
      status: "on",
      sortOrder: 99,
    });
    expect(updated?.content).toBe("更好用");
    expect(updated?.imageUrl).toBe("");
    expect(
      await UserReviewService.adminUpdate("000000000000000000000000", {
        content: "x",
      }),
    ).toBeNull();

    expect(await UserReviewService.adminDelete(b.id)).toBe(true);
    expect(await UserReviewService.adminDelete(b.id)).toBe(false);
  });
});
