import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import User from "../../../src/model/User";
import Note from "../../../src/model/Note";
import ClientEvent from "../../../src/model/ClientEvent";
import ReadingThemeChangeLog from "../../../src/model/ReadingThemeChangeLog";
import { UserPurgeService } from "../../../src/service/userPurge.service";

describe("unit: UserPurgeService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("parse 布尔 query", () => {
    expect(UserPurgeService.parseDryRunQuery("true")).toBe(true);
    expect(UserPurgeService.parseDryRunQuery("1")).toBe(true);
    expect(UserPurgeService.parseWithCosQuery("no")).toBe(false);
    expect(UserPurgeService.parseWithCosQuery(false)).toBe(false);
  });

  it("dryRun 返回统计且不删数据；正式清理删除用户", async () => {
    const { userId } = await seedUser({ userId: "purge-biz-1" });
    const book = await seedNoteBook(userId);
    await seedNote({ userId, noteBookId: book.id, title: "n" });

    expect(await UserPurgeService.purgeByBizUserId("")).toBeNull();
    expect(await UserPurgeService.purgeByBizUserId("missing")).toBeNull();

    const dry = await UserPurgeService.purgeByBizUserId(userId, {
      dryRun: true,
      withCos: true,
      verify: true,
      useTransactionIfPossible: false,
    });
    expect(dry?.dryRun).toBe(true);
    expect(dry?.stats.notes).toBe(1);
    expect(dry?.stats.user).toBe(1);
    expect(await Note.countDocuments({ userId })).toBe(1);

    const done = await UserPurgeService.purgeByBizUserId(userId, {
      dryRun: false,
      withCos: false,
      verify: true,
      useTransactionIfPossible: false,
    });
    expect(done?.verify?.ok).toBe(true);
    expect(done?.cos?.enabled).toBe(false);
    expect(await User.findOne({ userId })).toBeNull();
    expect(await Note.countDocuments({ userId })).toBe(0);
  });

  it("正式清理同步删除 ReadingThemeChangeLog 与 ClientEvent", async () => {
    const { userId } = await seedUser({ userId: "purge-audit-1" });
    await ReadingThemeChangeLog.create({
      userId,
      scope: "global",
      readingStyleKey: "journal",
      readingThemeId: "sage_green",
    });
    await ClientEvent.create({
      eventId: `evt-purge-${Date.now()}`,
      eventName: "me_menu_click",
      userId,
      clientTs: Date.now(),
      serverTs: new Date(),
      platform: "h5",
      pagePath: "/pages/me/me",
      requestId: `req-${Date.now()}`,
      props: { action: "open", itemId: "template" },
    });

    const dry = await UserPurgeService.purgeByBizUserId(userId, {
      dryRun: true,
      verify: false,
      useTransactionIfPossible: false,
    });
    expect(dry?.stats.readingThemeChangeLogs).toBe(1);
    expect(dry?.stats.clientEvents).toBe(1);

    const done = await UserPurgeService.purgeByBizUserId(userId, {
      dryRun: false,
      verify: true,
      useTransactionIfPossible: false,
    });
    expect(done?.verify?.ok).toBe(true);
    expect(await ReadingThemeChangeLog.countDocuments({ userId })).toBe(0);
    expect(await ClientEvent.countDocuments({ userId })).toBe(0);
  });
});
