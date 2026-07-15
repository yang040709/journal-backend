import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import User from "../../../src/model/User";
import { AdminUserCoverService } from "../../../src/service/adminUserCover.service";
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

describe("unit: AdminUserCoverService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    process.env.COS_PUBLIC_DOMAIN = "https://cdn.example.com";
    process.env.COS_UPLOAD_DIR = "journal";
  });

  it("读取替换快捷封面并透传自定义封面操作", async () => {
    const { userId } = await seedUser({ userId: "auc-1" });
    const user = await User.findOne({ userId }).lean();
    const mongoId = String(user!._id);

    await expect(
      AdminUserCoverService.getUserByMongoIdOrThrow("000000000000000000000000"),
    ).rejects.toThrow(/不存在/);

    const payload = await AdminUserCoverService.getCoversPayload(mongoId);
    expect(payload.userId).toBe(userId);

    const replaced = await AdminUserCoverService.replaceQuickCovers(mongoId, [
      "https://cdn.example.com/q1.png",
    ]);
    expect(replaced.quickCovers).toEqual(["https://cdn.example.com/q1.png"]);

    const coverUrl = `https://cdn.example.com/journal/${userId}/202607/a.png`;
    const added = await AdminUserCoverService.addCustomCover(mongoId, {
      coverUrl,
    });
    expect(added.length).toBe(1);
    const coverId = added[0].id;
    const next = `https://cdn.example.com/journal/${userId}/202607/b.png`;
    const updated = await AdminUserCoverService.updateCustomCover(
      mongoId,
      coverId,
      { coverUrl: next },
    );
    expect(updated[0].coverUrl).toBe(next);
    const deleted = await AdminUserCoverService.deleteCustomCover(
      mongoId,
      coverId,
    );
    expect(deleted).toEqual([]);

    vi.spyOn(CoverService, "addUserCustomCover").mockResolvedValue([]);
    await AdminUserCoverService.addCustomCover(mongoId, {
      coverUrl: "https://cdn.example.com/x.png",
    });
  });
});
