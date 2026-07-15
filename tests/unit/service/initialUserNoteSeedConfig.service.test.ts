import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { InitialUserNoteSeedConfigService } from "../../../src/service/initialUserNoteSeedConfig.service";

describe("unit: InitialUserNoteSeedConfigService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("seed / resolve / admin set 与校验", async () => {
    expect(() =>
      InitialUserNoteSeedConfigService.assertValidInput([
        { seedKey: "", title: "t", content: "c", targetIndex: 0, tags: [] },
      ]),
    ).toThrow(/seedKey/);

    const admin = await InitialUserNoteSeedConfigService.getForAdmin();
    expect(admin.templates.length).toBeGreaterThan(0);
    expect(admin.usedSeedKeys.length).toBeGreaterThan(0);

    const forUser =
      await InitialUserNoteSeedConfigService.resolveTemplatesForNewUser();
    expect(forUser.every((t) => t.seedKey && t.title)).toBe(true);

    const excluded =
      await InitialUserNoteSeedConfigService.getExcludedNoteSeedKeys();
    expect(excluded.size).toBeGreaterThan(0);

    const saved = await InitialUserNoteSeedConfigService.setForAdmin({
      templates: [
        {
          seedKey: "seed_ut_1",
          title: "欢迎",
          content: "hello",
          targetIndex: 0,
          tags: ["日常"],
          isPinned: true,
        },
        {
          seedKey: "seed_ut_2",
          title: "指南",
          content: "guide",
          targetIndex: 1,
          tags: [],
          isPinned: false,
        },
      ],
    });
    expect(saved.templates).toHaveLength(2);
    expect(saved.templates[0].isPinned).toBe(true);

    await expect(
      InitialUserNoteSeedConfigService.setForAdmin({
        templates: [
          {
            seedKey: "seed_ut_1",
            title: "a",
            content: "",
            targetIndex: 0,
            tags: [],
          },
          {
            seedKey: "seed_ut_1",
            title: "b",
            content: "",
            targetIndex: 0,
            tags: [],
          },
        ],
      }),
    ).rejects.toThrow(/重复/);
  });
});
