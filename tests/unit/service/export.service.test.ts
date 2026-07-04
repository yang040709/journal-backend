import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import mongoose from "mongoose";
import NoteBook from "../../../src/model/NoteBook";
import Note from "../../../src/model/Note";
import NoteExportLog from "../../../src/model/NoteExportLog";
import { ActivityLogger } from "../../../src/utils/ActivityLogger";
import { ExportService } from "../../../src/service/export.service";
import {
  NoteExportQuotaError,
  NoteExportService,
} from "../../../src/service/noteExport.service";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedUser } from "../../helpers/seed/user.seed";

vi.mock("../../../src/utils/ActivityLogger", () => ({
  ActivityLogger: {
    record: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("unit: ExportService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(ActivityLogger.record).mockClear();
  });

  it("exportUserData 返回手帐本与手帐统计", async () => {
    const { userId } = await seedUser();
    const nb = await seedNoteBook(userId, "导出测试本");
    await Note.create({
      noteBookId: nb.id,
      userId,
      title: "测试手帐",
      content: "内容",
      tags: ["日常"],
    });

    const data = await ExportService.exportUserData(userId);

    expect(data.version).toBe("2.0.0");
    expect(data.statistics.noteBookCount).toBe(1);
    expect(data.statistics.noteCount).toBe(1);
    expect(data.data.notes[0].title).toBe("测试手帐");
    expect(ActivityLogger.record).toHaveBeenCalledOnce();
  });

  it("exportUserData 失败时不写入活动日志", async () => {
    const { userId } = await seedUser();
    vi.spyOn(NoteBook, "find").mockRejectedValueOnce(new Error("mock db error"));

    await expect(ExportService.exportUserData(userId)).rejects.toThrow(
      "导出数据失败",
    );
    expect(ActivityLogger.record).not.toHaveBeenCalled();

    vi.mocked(NoteBook.find).mockRestore();
  });

  it("getExportFileName 返回带时间戳的备份文件名", () => {
    const name = ExportService.getExportFileName();
    expect(name).toMatch(/^手帐备份_/);
    expect(name.endsWith(".json")).toBe(true);
  });

  it("NoteExportService.run 手帐本不存在时不写入 NoteExportLog", async () => {
    const { userId } = await seedUser();
    const missingId = new mongoose.Types.ObjectId().toString();

    await expect(
      NoteExportService.run(userId, {
        noteBookId: missingId,
        sort: "updatedAt",
      }),
    ).rejects.toBeInstanceOf(NoteExportQuotaError);

    const logCount = await NoteExportLog.countDocuments({ userId });
    expect(logCount).toBe(0);
  });
});
