import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import {
  NotebookLimitsService,
  normalizeNotebookLimits,
} from "../../../src/service/notebookLimits.service";
import {
  NoteBookService,
  createNotebookLimitExceededError,
} from "../../../src/service/noteBook.service";
import NoteBook from "../../../src/model/NoteBook";

describe("unit: normalizeNotebookLimits", () => {
  it("默认 20 / 100", () => {
    expect(normalizeNotebookLimits({})).toEqual({
      defaultMaxNoteBookCount: 20,
      hardMaxNoteBookCount: 100,
    });
  });

  it("硬顶钳制在 1..100，默认不超过硬顶", () => {
    expect(
      normalizeNotebookLimits({
        defaultMaxNoteBookCount: 50,
        hardMaxNoteBookCount: 30,
      }),
    ).toEqual({
      defaultMaxNoteBookCount: 30,
      hardMaxNoteBookCount: 30,
    });
    expect(
      normalizeNotebookLimits({
        hardMaxNoteBookCount: 999,
      }),
    ).toEqual({
      defaultMaxNoteBookCount: 20,
      hardMaxNoteBookCount: 100,
    });
  });
});

describe("unit: NotebookLimitsService + NoteBookService.createNoteBook", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("空库 ensure 后 effective 为 20", async () => {
    const max = await NotebookLimitsService.getEffectiveMaxNoteBookCount();
    expect(max).toBe(20);
  });

  it("Admin 下调后创建触顶抛 NOTEBOOK_LIMIT_EXCEEDED", async () => {
    await NotebookLimitsService.setFromAdmin({
      defaultMaxNoteBookCount: 2,
      hardMaxNoteBookCount: 100,
    });
    const { userId } = await seedUser({ userId: "nb-limit-1" });
    await NoteBookService.createNoteBook({
      title: "本1",
      userId,
    });
    await NoteBookService.createNoteBook({
      title: "本2",
      userId,
    });
    await expect(
      NoteBookService.createNoteBook({ title: "本3", userId }),
    ).rejects.toMatchObject({
      code: "NOTEBOOK_LIMIT_EXCEEDED",
      message: expect.stringContaining("2"),
    });
    expect(createNotebookLimitExceededError(2).message).toContain("2");
    const live = await NoteBook.countDocuments({
      userId,
      isDeleted: { $ne: true },
    });
    expect(live).toBe(2);
  });

  it("列表返回 maxNoteBookCount", async () => {
    await NotebookLimitsService.setFromAdmin({
      defaultMaxNoteBookCount: 15,
      hardMaxNoteBookCount: 50,
    });
    const { userId } = await seedUser({ userId: "nb-limit-list" });
    const result = await NoteBookService.getUserNoteBooks(userId, {
      page: 1,
      limit: 20,
    });
    expect(result.maxNoteBookCount).toBe(15);
  });
});
