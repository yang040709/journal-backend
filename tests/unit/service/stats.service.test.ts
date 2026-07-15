import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import Reminder from "../../../src/model/Reminder";
import Template from "../../../src/model/Template";
import Activity from "../../../src/model/Activity";
import Note from "../../../src/model/Note";
import { StatsService } from "../../../src/service/stats.service";

describe("unit: StatsService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("覆盖各统计入口的主路径", async () => {
    const { userId } = await seedUser({ userId: "stats-u1" });
    const book = await seedNoteBook(userId, "日常本");
    const emptyBook = await seedNoteBook(userId, "空本");
    const n1 = await seedNote({
      userId,
      noteBookId: book.id,
      title: "有图",
      tags: ["日常", "咖啡"],
    });
    const n2 = await seedNote({
      userId,
      noteBookId: book.id,
      title: "无标签",
      tags: [],
    });
    await Note.updateOne(
      { _id: n1.id },
      {
        $set: {
          images: [
            {
              key: "journal/u/a.png",
              url: "https://cdn.example.com/a.png",
              mimeType: "image/png",
              size: 1024 * 1024,
            },
          ],
        },
      },
    );
    await Note.updateOne(
      { _id: n2.id },
      {
        $set: {
          images: [
            {
              key: "journal/u/b.jpg",
              url: "https://cdn.example.com/b.jpg",
              mimeType: "image/jpeg",
              size: 2048,
            },
            {
              key: "journal/u/c.webp",
              url: "https://cdn.example.com/c.webp",
              mimeType: "image/webp",
              size: 100,
            },
          ],
        },
      },
    );

    await Reminder.create({
      userId,
      noteId: "n1",
      title: "r",
      content: "c",
      remindTime: new Date(Date.now() - 60_000),
      messageId: "m",
      subscriptionStatus: "subscribed",
      sendStatus: "pending",
      retryCount: 1,
    });
    await Reminder.create({
      userId,
      noteId: "n2",
      title: "r2",
      content: "c2",
      remindTime: new Date(),
      messageId: "m2",
      subscriptionStatus: "subscribed",
      sendStatus: "sent",
      retryCount: 0,
      sentAt: new Date(),
    });
    await Template.create({
      userId,
      name: "自定义",
      description: "",
      fields: { title: "t", content: "c", tags: [] },
      isSystem: false,
    });
    await Activity.create({
      userId,
      type: "create",
      target: "note",
      targetId: "x",
      title: "创建",
    });

    const userStats = await StatsService.getUserStats(userId);
    expect(userStats.noteCount).toBe(2);
    expect(userStats.noteBookCount).toBe(2);

    const tags = await StatsService.getTagStats(userId);
    expect(tags.some((t) => t.tag === "咖啡")).toBe(true);

    const timeline = await StatsService.getUserActivityTimeline(userId, 5);
    expect(timeline.length).toBe(1);

    const usage = await StatsService.getNoteBookUsageStats(userId);
    expect(usage.find((x) => x.noteBookId === book.id)?.noteCount).toBe(2);
    expect(usage.find((x) => x.noteBookId === emptyBook.id)?.noteCount).toBe(0);

    const overview = await StatsService.getOverviewStats(userId);
    expect(overview.noteTotal).toBe(2);
    expect(overview.newNotes7d).toBe(2);

    const trend = await StatsService.getCreationTrendStats(userId, 7);
    expect(trend.dailyCreated.length).toBe(7);
    expect(trend.hourlyUpdated.length).toBe(24);

    const tagQuality = await StatsService.getTagQualityStats(userId);
    expect(tagQuality.topTags.length).toBeGreaterThan(0);
    expect(tagQuality.untaggedRate).toBeGreaterThan(0);

    const health = await StatsService.getNotebookHealthStats(userId);
    expect(health.emptyNotebookCount).toBe(1);

    const images = await StatsService.getImageAssetStats(userId);
    expect(images.imageTotal).toBe(3);
    expect(images.formatDistribution.find((f) => f.format === "png")?.count).toBe(
      1,
    );

    const rem = await StatsService.getReminderPerformanceStats(userId);
    expect(rem.total).toBe(2);
    expect(rem.pending).toBe(1);

    const tpl = await StatsService.getTemplateUsageStats(userId);
    expect(tpl.customTemplateTotal).toBe(1);
  });
});
