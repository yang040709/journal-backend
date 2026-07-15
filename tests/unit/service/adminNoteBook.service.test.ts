import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import Note from "../../../src/model/Note";
import { AdminNoteBookService } from "../../../src/service/adminNoteBook.service";

describe("unit: AdminNoteBookService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("CRUD 与按用户筛选、删除联动笔记", async () => {
    const { userId } = await seedUser({ userId: "admin-nb-1" });
    const created = await AdminNoteBookService.createNoteBook({
      userId,
      title: "本一",
      coverImg: "https://cdn.example/c.png",
    });
    await seedNoteBook(userId, "本二");


    const listed = await AdminNoteBookService.listNoteBooks({
      page: 1,
      limit: 10,
      userId,
      sortBy: "title",
      order: "asc",
    });
    expect(listed.total).toBe(2);

    const got = await AdminNoteBookService.getNoteBookById(String(created._id));
    expect(got?.title).toBe("本一");
    expect(
      await AdminNoteBookService.getNoteBookById("000000000000000000000000"),
    ).toBeNull();

    const updated = await AdminNoteBookService.updateNoteBook(String(created._id), {
      title: "本一改",
      coverImg: "",
    });
    expect(updated?.title).toBe("本一改");
    expect(
      await AdminNoteBookService.updateNoteBook("000000000000000000000000", {
        title: "x",
      }),
    ).toBeNull();

    await seedNote({ userId, noteBookId: String(created._id), title: "n1" });
    const noteBefore = await Note.findOne({ noteBookId: String(created._id) });
    const Reminder = (await import("../../../src/model/Reminder")).default;
    const ShareSecurityTask = (
      await import("../../../src/model/ShareSecurityTask")
    ).default;
    if (noteBefore) {
      await Reminder.create({
        userId,
        noteId: String(noteBefore._id),
        title: "r",
        content: "c",
        remindTime: new Date(Date.now() + 3600_000),
        messageId: "tpl-1",
        subscriptionStatus: "subscribed",
        sendStatus: "pending",
        retryCount: 0,
      });
      await ShareSecurityTask.create({
        taskId: `nb-task-${Date.now()}`,
        noteId: String(noteBefore._id),
        userId,
        shareVersion: 1,
        scene: "share_enable",
        source: "local",
        status: "pass",
        retryCount: 0,
        snapshot: {
          title: "t",
          content: "c",
          tags: [],
          images: [],
          riskMeta: { source: "local" },
        },
      });
    }
    expect(await AdminNoteBookService.deleteNoteBook(String(created._id))).toBe(
      true,
    );
    expect(await Note.countDocuments({ noteBookId: String(created._id) })).toBe(
      0,
    );
    if (noteBefore) {
      expect(
        await Reminder.countDocuments({ noteId: String(noteBefore._id) }),
      ).toBe(0);
      expect(
        await ShareSecurityTask.countDocuments({
          noteId: String(noteBefore._id),
        }),
      ).toBe(0);
    }
    expect(
      await AdminNoteBookService.deleteNoteBook("000000000000000000000000"),
    ).toBe(false);
  });
});
