import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import Note from "../../../src/model/Note";
import NoteBook from "../../../src/model/NoteBook";
import { AdminOperationsReportService } from "../../../src/service/adminOperationsReport.service";
import { CoverService } from "../../../src/service/cover.service";


describe("unit: AdminOperationsReportService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("validateRange 校验边界", () => {
    expect(() =>
      AdminOperationsReportService.validateRange("bad", "2026-01-02", "Asia/Shanghai"),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      AdminOperationsReportService.validateRange(
        "2026-02-01",
        "2026-01-01",
        "Asia/Shanghai",
      ),
    ).toThrow(/不能晚于/);
    expect(() =>
      AdminOperationsReportService.validateRange(
        "2020-01-01",
        "2026-01-01",
        "Asia/Shanghai",
      ),
    ).toThrow(/跨度/);
  });

  it("getReport 可对空库产出结构完整结果", async () => {
    const { userId } = await seedUser({ userId: "ops-u1" });
    await CoverService.setSystemCovers(["https://cdn.example.com/s.png"]);
    const book = await seedNoteBook(userId, "运营本");
    await NoteBook.updateOne(
      { _id: book.id },
      { $set: { coverImg: "https://cdn.example.com/s.png" } },
    );
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "今日",
      tags: ["日常"],
    });
    await Note.updateOne(
      { _id: note.id },
      {
        $set: {
          images: [
            {
              key: "journal/u/a.png",
              url: "https://cdn.example.com/a.png",
              mimeType: "image/png",
              size: 10,
            },
          ],
        },
      },
    );


    const today = new Date();
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(today);

    const report = await AdminOperationsReportService.getReport(ymd, ymd);
    expect(report.range.startDate).toBe(ymd);
    expect(report.dailyNewNotes.length).toBe(1);
    expect(report.notesByHour.length).toBe(24);
    expect(Array.isArray(report.systemCoverUsage)).toBe(true);
    expect(Array.isArray(report.tagUsage)).toBe(true);
  });
});
