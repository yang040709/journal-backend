import { Types } from "mongoose";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import {
  assertSafeLinkPath,
  BrowseBannerService,
} from "../../../src/service/browseBanner.service";

describe("unit: BrowseBannerService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("assertSafeLinkPath 校验路径", () => {
    expect(assertSafeLinkPath("/pages/index/index")).toBe("/pages/index/index");
    expect(() => assertSafeLinkPath("pages/x")).toThrow(/开头/);
    expect(() => assertSafeLinkPath("/foo/bar")).toThrow(/pages/);
    expect(() => assertSafeLinkPath("/pages/a://b")).toThrow(/非法/);
  });

  it("set/list/public/click 全链路", async () => {
    const id = new Types.ObjectId().toString();
    const saved = await BrowseBannerService.setForAdmin([
      {
        id,
        imageUrl: "https://cdn.example/b1.png",
        type: "link",
        linkPath: "/packages/me-profile/pages/x/x",
        priority: 10,
        enabled: true,
        title: "轮播一",
      },
      {
        imageUrl: "https://cdn.example/b2.png",
        type: "preview_image",
        previewImageUrl: "https://cdn.example/b2-preview.png",
        priority: 1,
        enabled: true,
      },
      {
        imageUrl: "https://cdn.example/b3.png",
        type: "none",
        priority: 0,
        enabled: false,
      },
    ]);
    expect(saved.items.length).toBe(3);

    const admin = await BrowseBannerService.getForAdmin();
    expect(admin.items.some((i) => i.title === "轮播一")).toBe(true);

    const pub = await BrowseBannerService.listPublic();
    expect(pub.length).toBe(2);
    expect(pub[0].type).toBe("link");

    await BrowseBannerService.recordClick({
      bannerId: id,
      userId: "click-user",
    });
    const afterClick = await BrowseBannerService.getForAdmin();
    const clicked = afterClick.items.find((i) => i.id === id);
    expect(clicked?.clickPv).toBe(1);
    expect(clicked?.clickUv).toBe(1);

    await expect(
      BrowseBannerService.recordClick({ bannerId: "bad" }),
    ).rejects.toThrow(/非法/);

    await expect(
      BrowseBannerService.setForAdmin([
        {
          imageUrl: "ftp://bad",
          type: "none",
          priority: 0,
          enabled: true,
        },
      ]),
    ).rejects.toThrow(/http/);
  });
});
