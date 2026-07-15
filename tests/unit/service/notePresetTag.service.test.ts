import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { NotePresetTagService } from "../../../src/service/notePresetTag.service";

describe("unit: NotePresetTagService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("校验 / 过滤 / 读写预设标签", async () => {
    expect(() => NotePresetTagService.assertValidTagList([])).toThrow(/至少/);
    expect(() =>
      NotePresetTagService.assertValidTagList(["x".repeat(30)]),
    ).toThrow(/超过/);
    expect(
      NotePresetTagService.filterToPreset(["日常", "x", "日常", ""], [
        "日常",
        "计划",
      ]),
    ).toEqual(["日常"]);

    const seeded = await NotePresetTagService.getTagNames();
    expect(seeded.length).toBeGreaterThan(0);
    const admin = await NotePresetTagService.getForAdmin();
    expect(admin.tags).toEqual(seeded);

    const saved = await NotePresetTagService.setTagNames([
      " 标签A ",
      "标签B",
      "标签A",
    ]);
    expect(saved.tags).toEqual(["标签A", "标签B"]);
    expect((await NotePresetTagService.getTagNames()).length).toBe(2);
  });
});
