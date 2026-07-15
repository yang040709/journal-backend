import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { InitialUserNotebookConfigService } from "../../../src/service/initialUserNotebookConfig.service";

describe("unit: InitialUserNotebookConfigService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("seed / resolve / admin set", async () => {
    expect(() =>
      InitialUserNotebookConfigService.assertValidInput([]),
    ).toThrow(/至少配置/);

    const forUser =
      await InitialUserNotebookConfigService.resolveTemplatesForNewUser();
    expect(forUser.length).toBeGreaterThan(0);

    const admin = await InitialUserNotebookConfigService.getForAdmin();
    expect(admin.templates.length).toBeGreaterThan(0);

    const saved = await InitialUserNotebookConfigService.setForAdmin({
      templates: [
        {
          title: "本A",
          coverImg: "https://cdn.example.com/a.png",
          enabled: true,
        },
        {
          title: "本B",
          coverImg: "https://cdn.example.com/b.png",
          enabled: false,
        },
      ],
    });
    expect(saved.templates).toHaveLength(2);

    const excluded =
      await InitialUserNotebookConfigService.getExcludedNotebookTitles();
    expect(excluded.has("本A")).toBe(true);
    expect(excluded.has("本B")).toBe(false);

    await expect(
      InitialUserNotebookConfigService.setForAdmin({
        templates: [
          {
            title: "本C",
            coverImg: "ftp://bad",
            enabled: true,
          },
        ],
      }),
    ).rejects.toThrow(/http/);
  });
});

