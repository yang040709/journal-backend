import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { AnnouncementService } from "../../../src/service/announcement.service";

describe("unit: AnnouncementService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("管理员创建/发布/浏览/下线/删除草稿", async () => {
    expect(AnnouncementService.buildFrontendPath("abc")).toContain("abc");

    const draft = await AnnouncementService.adminCreate(
      {
        title: "标题A",
        content: "正文",
        images: ["https://cdn.example/1.png", "", "https://cdn.example/2.png"],
        priority: 5,
        showViewCount: true,
        status: "draft",
      },
      { id: "admin-1" },
    );
    expect(draft?.status).toBe("draft");
    expect(draft?.images.length).toBe(2);

    const published = await AnnouncementService.adminPublish(draft!.id, {
      id: "admin-1",
    });
    expect(published?.status).toBe("published");

    const pubList = await AnnouncementService.listPublic({ page: 1, limit: 10 });
    expect(pubList.total).toBe(1);
    expect(pubList.items[0].viewCount).toBe(0);

    const detail = await AnnouncementService.getPublishedDetailAndIncreaseView(
      draft!.id,
    );
    expect(detail?.viewCount).toBe(1);
    expect(
      await AnnouncementService.getPublishedDetailAndIncreaseView(
        "000000000000000000000000",
      ),
    ).toBeNull();

    const adminList = await AnnouncementService.adminList({
      page: 1,
      limit: 10,
      keyword: "标题",
      sortBy: "status",
      order: "desc",
    });
    expect(adminList.total).toBe(1);
    expect(adminList.items[0].frontendPath).toContain(draft!.id);

    const updated = await AnnouncementService.adminUpdate(
      draft!.id,
      {
        title: "标题B",
        content: "正文2",
        images: ["https://cdn.example/3.png"],
        priority: 1,
        showViewCount: false,
      },
      { id: "admin-2" },
    );
    expect(updated?.title).toBe("标题B");
    expect(updated?.showViewCount).toBe(false);

    const offline = await AnnouncementService.adminOffline(draft!.id, {
      id: "admin-2",
    });
    expect(offline?.status).toBe("offline");
    expect(
      await AnnouncementService.adminOffline(draft!.id, { id: "admin-2" }),
    ).toBeNull();

    const d2 = await AnnouncementService.adminCreate({
      title: "可删草稿",
      content: "x",
      status: "draft",
    });
    expect(await AnnouncementService.adminDeleteDraft(d2!.id)).toBe(true);
    expect(await AnnouncementService.adminDeleteDraft(d2!.id)).toBe(false);
    expect(
      await AnnouncementService.adminGetById("000000000000000000000000"),
    ).toBeNull();
  });
});
