import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import Note from "../../../src/model/Note";
import { NoteSearchService } from "../../../src/service/note/noteSearch.service";


describe("unit: NoteSearchService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("空关键词不筛选；分页深度超限抛错", async () => {
    const empty = await NoteSearchService.searchNotes("u", { q: "   " });
    expect(empty.total).toBe(0);
    await expect(
      NoteSearchService.searchNotes("u", { page: 1000, limit: 100 }),
    ).rejects.toThrow(/分页深度/);
  });


  it("按关键词/标签/收藏/时间筛选并返回 recent", async () => {
    const { userId } = await seedUser({ userId: "search-u1" });
    const book = await seedNoteBook(userId);
    const fav = await seedNote({
      userId,
      noteBookId: book.id,
      title: "咖啡日记",
      content: "拿铁好喝",
      tags: ["咖啡", "日常"],
    });
    await Note.updateOne(
      { _id: fav.id },
      { $set: { isFavorite: true, favoritedAt: new Date() } },
    );
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "工作",
      content: "开会",
      tags: ["工作"],
    });


    const hit = await NoteSearchService.searchNotes(userId, {
      q: "咖啡",
      noteBookId: book.id,
      tags: ["咖啡"],
      favoriteOnly: true,
      startTime: Date.now() - 86_400_000,
      endTime: Date.now() + 86_400_000,
      page: 1,
      limit: 10,
      sortBy: "createdAt",
      order: "desc",
    });
    expect(hit.total).toBe(1);
    expect(hit.items[0].title).toContain("咖啡");

    const recent = await NoteSearchService.getRecentNotes(userId, 5);
    expect(recent.length).toBe(2);
  });
});
