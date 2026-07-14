import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Note from "../../../src/model/Note";
import NoteExportLog from "../../../src/model/NoteExportLog";
import NoteExportWeeklyUsage from "../../../src/model/NoteExportWeeklyUsage";
import User from "../../../src/model/User";
import SystemConfig, {
  SYSTEM_CONFIG_EXPORT_SETTINGS_KEY,
} from "../../../src/model/SystemConfig";
import {
  DEFAULT_EXPORT_SETTINGS,
} from "../../../src/service/noteExportSettings.service";
import {
  NoteExportQuotaError,
  NoteExportService,
} from "../../../src/service/noteExport.service";
import { getQuotaDateContext } from "../../../src/utils/dateKey";
import { getZonedWeekRangeUtc } from "../../../src/utils/weekBounds";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedUser } from "../../helpers/seed/user.seed";

describe("unit: NoteExportService quota", () => {
  beforeAll(async () => {
    await connectTestDb();
    await NoteExportWeeklyUsage.createIndexes();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    await SystemConfig.create({
      configKey: SYSTEM_CONFIG_EXPORT_SETTINGS_KEY,
      exportSettings: {
        ...DEFAULT_EXPORT_SETTINGS,
        exportWeeklyFreeCount: 2,
      },
    });
  });

  it("并发免费导出不超过周额度", async () => {
    const { userId } = await seedUser({ points: 0 });
    await User.updateOne({ userId }, { $set: { exportExtraCredits: 0 } });
    const book = await seedNoteBook(userId);
    await Note.create({
      noteBookId: book.id,
      userId,
      title: "导出手帐",
      content: "内容",
      tags: [],
    });

    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        NoteExportService.run(userId, {
          noteBookId: book.id,
          sort: "updatedAt",
        }),
      ),
    );

    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<typeof NoteExportService.run>>
    >[];
    expect(ok.length).toBe(2);
    expect(ok.every((r) => r.value.source === "weekly_free")).toBe(true);

    const failed = results.filter((r) => r.status === "rejected");
    expect(failed.length).toBe(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      NoteExportQuotaError,
    );

    const freeLogs = await NoteExportLog.countDocuments({
      userId,
      source: "weekly_free",
    });
    expect(freeLogs).toBe(2);
  });

  it("付费路径失败后归还 exportExtraCredits", async () => {
    const { userId } = await seedUser({ points: 0 });
    await User.updateOne({ userId }, { $set: { exportExtraCredits: 1 } });
    await SystemConfig.findOneAndUpdate(
      { configKey: SYSTEM_CONFIG_EXPORT_SETTINGS_KEY },
      { $set: { exportSettings: { ...DEFAULT_EXPORT_SETTINGS, exportWeeklyFreeCount: 0 } } },
    );
    const book = await seedNoteBook(userId);

    const spy = vi.spyOn(Note, "find").mockImplementation(() => {
      throw new Error("mock query failure");
    });

    await expect(
      NoteExportService.run(userId, {
        noteBookId: book.id,
        sort: "updatedAt",
      }),
    ).rejects.toThrow("mock query failure");

    spy.mockRestore();

    const user = await User.findOne({ userId }).select("exportExtraCredits").lean();
    expect(user?.exportExtraCredits).toBe(1);
  });

  it("冷启动：已有本周 free log 时 counter 对齐后不可超额免费导出", async () => {
    const { userId } = await seedUser({ points: 0 });
    await User.updateOne({ userId }, { $set: { exportExtraCredits: 0 } });
    const book = await seedNoteBook(userId);
    await Note.create({
      noteBookId: book.id,
      userId,
      title: "导出手帐",
      content: "内容",
      tags: [],
    });

    const { timezone } = getQuotaDateContext();
    const { weekStartUtc, weekEndExclusiveUtc } = getZonedWeekRangeUtc(new Date(), timezone);
    const weekKey = NoteExportService.weekKeyFromStart(weekStartUtc);

    await NoteExportLog.create([
      {
        userId,
        noteBookId: book.id,
        noteBookTitle: "b",
        rangeStart: weekStartUtc,
        rangeEnd: weekEndExclusiveUtc,
        sort: "updatedAt",
        totalInRange: 1,
        truncated: false,
        noteCount: 1,
        source: "weekly_free",
        createdAt: weekStartUtc,
      },
      {
        userId,
        noteBookId: book.id,
        noteBookTitle: "b",
        rangeStart: weekStartUtc,
        rangeEnd: weekEndExclusiveUtc,
        sort: "updatedAt",
        totalInRange: 1,
        truncated: false,
        noteCount: 1,
        source: "weekly_free",
        createdAt: new Date(weekStartUtc.getTime() + 1000),
      },
    ]);

    await expect(
      NoteExportService.run(userId, {
        noteBookId: book.id,
        sort: "updatedAt",
      }),
    ).rejects.toBeInstanceOf(NoteExportQuotaError);

    const usage = await NoteExportWeeklyUsage.findOne({ userId, weekKey }).lean();
    expect(usage?.used).toBe(2);
  });
});
