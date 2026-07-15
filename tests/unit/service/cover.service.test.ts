import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import SystemConfig, {
  SYSTEM_CONFIG_COVERS_KEY,
} from "../../../src/model/SystemConfig";
import User from "../../../src/model/User";
import { CoverService } from "../../../src/service/cover.service";

vi.mock("../../../src/service/userImageAsset.service", () => ({
  recordFromCover: vi.fn(),
}));
vi.mock("../../../src/service/mediaReference.service", () => ({
  MediaReferenceService: {
    referenceCover: vi.fn(),
    releaseCoverRef: vi.fn(),
  },
}));

describe("unit: CoverService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    process.env.COS_PUBLIC_DOMAIN = "https://cdn.example.com";
    process.env.COS_UPLOAD_DIR = "journal";
  });

  it("系统封面读写与校验", async () => {
    const seeded = await CoverService.getSystemCovers();
    expect(seeded.length).toBeGreaterThan(0);

    await expect(CoverService.setSystemCovers([])).rejects.toThrow(/至少/);
    await expect(
      CoverService.setSystemCovers(["ftp://bad"]),
    ).rejects.toThrow(/http/);

    const set = await CoverService.setSystemCovers([
      "https://cdn.example.com/c1.png",
      "https://cdn.example.com/c2.png",
    ]);
    expect(set.coverUrls).toHaveLength(2);

    const admin = await CoverService.getSystemCoversForAdmin();
    expect(admin.coverUrls).toEqual(set.coverUrls);
    expect(admin.updatedAt).toBeTruthy();
  });

  it("快捷封面默认/更新/初始化与运营校验", async () => {
    const { userId } = await seedUser({ userId: "cover-u1" });
    await CoverService.setSystemCovers([
      "https://cdn.example.com/s1.png",
      "https://cdn.example.com/s2.png",
    ]);

    const defaults = await CoverService.getUserQuickCovers(userId);
    expect(defaults.length).toBeGreaterThan(0);

    await expect(
      CoverService.updateUserQuickCovers(userId, { covers: [] }),
    ).rejects.toThrow(/1到/);

    const updated = await CoverService.updateUserQuickCovers(userId, {
      covers: ["https://cdn.example.com/s1.png"],
    });
    expect(updated.quickCovers).toEqual(["https://cdn.example.com/s1.png"]);

    await expect(
      CoverService.updateUserQuickCovers(userId, {
        covers: ["https://cdn.example.com/not-allowed.png"],
      }),
    ).rejects.toThrow(/无效/);

    await User.updateOne({ userId }, { $set: { quickCovers: [] } });
    await CoverService.initUserQuickCovers(userId);
    const afterInit = await CoverService.getUserQuickCovers(userId);
    expect(afterInit.length).toBeGreaterThan(0);
    await CoverService.initUserQuickCovers(userId);

    expect(
      CoverService.validateAdminQuickCoversInput([
        "https://cdn.example.com/a.png",
      ]),
    ).toHaveLength(1);
    expect(() =>
      CoverService.validateAdminQuickCoversInput(["not-url"]),
    ).toThrow(/http/);
  });

  it("自定义封面增删改与 normalize", async () => {
    const { userId } = await seedUser({ userId: "cover-u2" });
    const coverUrl = `https://cdn.example.com/journal/${userId}/202607/c.png`;
    const thumbUrl = `https://cdn.example.com/journal/${userId}/202607/t.png`;

    expect(
      CoverService.normalizeCustomCoverItem({
        _id: "id1",
        coverUrl,
        thumbUrl,
        thumbKey: `journal/${userId}/202607/t.png`,
        createdAt: new Date(),
      }).id,
    ).toBe("id1");

    const added = await CoverService.addUserCustomCover(userId, {
      coverUrl,
      thumbUrl,
      thumbKey: `journal/${userId}/202607/t.png`,
    });
    expect(added.length).toBe(1);
    const coverId = added[0].id;

    const listed = await CoverService.getUserCustomCovers(userId);
    expect(listed[0].coverUrl).toBe(coverUrl);

    const nextUrl = `https://cdn.example.com/journal/${userId}/202607/c2.png`;
    const updated = await CoverService.updateUserCustomCover(userId, coverId, {
      coverUrl: nextUrl,
      thumbUrl: "",
      thumbKey: "",
    });
    expect(updated[0].coverUrl).toBe(nextUrl);

    const deleted = await CoverService.deleteUserCustomCover(userId, coverId);
    expect(deleted).toEqual([]);

    await expect(
      CoverService.addUserCustomCover(userId, { coverUrl: "https://evil.com/x.png" }),
    ).rejects.toThrow();
  });

  it("空 coverUrls 文档回落常量种子", async () => {
    await SystemConfig.create({
      configKey: SYSTEM_CONFIG_COVERS_KEY,
      coverUrls: [],
    });
    const covers = await CoverService.getSystemCovers();
    expect(covers.length).toBeGreaterThan(0);
  });

  it("MAX_SYSTEM_COVERS / 用户不存在 / 自定义封面边界", async () => {
    const prev = process.env.MAX_SYSTEM_COVERS;
    process.env.MAX_SYSTEM_COVERS = "2";
    try {
      await expect(
        CoverService.setSystemCovers([
          "https://cdn.example.com/a.png",
          "https://cdn.example.com/b.png",
          "https://cdn.example.com/c.png",
        ]),
      ).rejects.toThrow(/最多/);
    } finally {
      if (prev === undefined) delete process.env.MAX_SYSTEM_COVERS;
      else process.env.MAX_SYSTEM_COVERS = prev;
    }

    await expect(CoverService.getUserQuickCovers("ghost-cover")).rejects.toThrow(
      /用户不存在/,
    );
    await expect(
      CoverService.updateUserQuickCovers("ghost-cover", {
        covers: ["https://cdn.example.com/a.png"],
      }),
    ).rejects.toThrow(/用户不存在/);

    const { userId } = await seedUser({ userId: "cover-edge" });
    await CoverService.setSystemCovers([
      "https://cdn.example.com/s1.png",
      "https://cdn.example.com/s2.png",
    ]);

    await expect(
      CoverService.updateUserQuickCovers(userId, {
        covers: Array.from({ length: 12 }, (_, i) => `https://cdn.example.com/s${i}.png`),
      }),
    ).rejects.toThrow(/1到/);

    const coverUrl = `https://cdn.example.com/journal/${userId}/202607/e.png`;
    await expect(
      CoverService.addUserCustomCover(userId, {
        coverUrl,
        thumbUrl: "https://cdn.example.com/other-user/t.png",
      }),
    ).rejects.toThrow();

    await expect(
      CoverService.addUserCustomCover(userId, {
        coverUrl: "https://cdn.example.com/journal/other-user/202607/x.png",
      }),
    ).rejects.toThrow();

    const added = await CoverService.addUserCustomCover(userId, { coverUrl });
    expect(added).toHaveLength(1);

    await expect(
      CoverService.updateUserCustomCover(userId, "", {
        coverUrl: `https://cdn.example.com/journal/${userId}/202607/e2.png`,
      }),
    ).rejects.toThrow(/封面ID/);

    const missingCoverId = new mongoose.Types.ObjectId().toString();
    await expect(
      CoverService.updateUserCustomCover(userId, missingCoverId, {
        coverUrl: `https://cdn.example.com/journal/${userId}/202607/e2.png`,
      }),
    ).rejects.toThrow(/不存在|Cast/);

    await expect(
      CoverService.deleteUserCustomCover(userId, missingCoverId),
    ).rejects.toThrow(/不存在/);

    expect(
      CoverService.normalizeCustomCoverItem({
        coverUrl: "",
        createdAt: null,
        updatedAt: null,
      }).id,
    ).toBe("");

    expect(() =>
      CoverService.validateAdminQuickCoversInput([]),
    ).toThrow();
  });
});
