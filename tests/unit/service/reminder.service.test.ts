import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import Reminder from "../../../src/model/Reminder";
import {
  REMINDER_SEND_STUCK_MS,
  ReminderService,
} from "../../../src/service/reminder.service";
import { WeChatService } from "../../../src/service/wechat.service";
import { NoteService } from "../../../src/service/note.service";
import { createAuthUser } from "../../helpers/authFactory";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";

vi.mock("../../../src/service/wechat.service", () => ({
  WeChatService: {
    sendSubscriptionMessage: vi.fn(),
  },
}));

async function createPendingReminder(overrides: Record<string, unknown> = {}) {
  return Reminder.create({
    userId: "reminder-user-1",
    noteId: "note-1",
    title: "提醒标题",
    content: "提醒内容",
    remindTime: new Date(Date.now() - 60_000),
    messageId: "tpl-1",
    subscriptionStatus: "subscribed",
    sendStatus: "pending",
    retryCount: 0,
    ...overrides,
  });
}

describe("unit: ReminderService send/claim", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(WeChatService.sendSubscriptionMessage).mockReset();
  });

  it("发送失败后 retryCount 正确自增并回到 pending", async () => {
    const { userId } = await createAuthUser({ userId: "reminder-fail-1" });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });
    const doc = await createPendingReminder({
      userId,
      noteId: String(note.id),
    });
    vi.mocked(WeChatService.sendSubscriptionMessage).mockResolvedValue(false);

    const ok = await ReminderService.sendReminder(doc.toObject() as any);
    expect(ok).toBe(false);

    const after = await Reminder.findById(doc._id).lean();
    expect(after?.retryCount).toBe(1);
    expect(after?.sendStatus).toBe("pending");
    expect(after?.lastError).toBeTruthy();
  });

  it("第三次失败标记为 failed", async () => {
    const { userId } = await createAuthUser({ userId: "reminder-fail-3" });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });
    const doc = await createPendingReminder({
      userId,
      noteId: String(note.id),
      retryCount: 2,
    });
    vi.mocked(WeChatService.sendSubscriptionMessage).mockResolvedValue(false);

    await ReminderService.sendReminder(doc.toObject() as any);

    const after = await Reminder.findById(doc._id).lean();
    expect(after?.retryCount).toBe(3);
    expect(after?.sendStatus).toBe("failed");
  });

  it("并发 claim 同一提醒仅一次成功", async () => {
    const doc = await createPendingReminder();
    const id = String(doc._id);

    const [a, b] = await Promise.all([
      ReminderService.claimReminderForSend(id),
      ReminderService.claimReminderForSend(id),
    ]);

    const wins = [a, b].filter(Boolean);
    expect(wins).toHaveLength(1);

    const after = await Reminder.findById(id).lean();
    expect(after?.sendStatus).toBe("sending");
  });

  it("发送成功标记 sent", async () => {
    const { userId } = await createAuthUser({ userId: "reminder-send-ok" });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id, title: "可发" });
    const doc = await createPendingReminder({
      userId,
      noteId: String(note.id),
    });
    vi.mocked(WeChatService.sendSubscriptionMessage).mockResolvedValue(true);

    const ok = await ReminderService.sendReminder(doc.toObject() as any);
    expect(ok).toBe(true);

    const after = await Reminder.findById(doc._id).lean();
    expect(after?.sendStatus).toBe("sent");
    expect(after?.sentAt).toBeTruthy();
    expect(after?.sendLockedAt).toBeNull();
  });

  it("reclaimStuckSending 回收超时 sending", async () => {
    const stuckAt = new Date(Date.now() - REMINDER_SEND_STUCK_MS - 1000);
    const doc = await createPendingReminder({
      sendStatus: "sending",
      sendLockedAt: stuckAt,
    });

    const n = await ReminderService.reclaimStuckSending();
    expect(n).toBe(1);

    const after = await Reminder.findById(doc._id).lean();
    expect(after?.sendStatus).toBe("pending");
    expect(after?.sendLockedAt).toBeNull();
  });

  it("未超时的 sending 不回收", async () => {
    const doc = await createPendingReminder({
      sendStatus: "sending",
      sendLockedAt: new Date(),
    });

    const n = await ReminderService.reclaimStuckSending();
    expect(n).toBe(0);

    const after = await Reminder.findById(doc._id).lean();
    expect(after?.sendStatus).toBe("sending");
  });

  it("getPendingReminders / claim 排除 noteUnavailable", async () => {
    await createPendingReminder({ noteId: "ok-note" });
    await createPendingReminder({
      noteId: "gone-note",
      noteUnavailable: true,
      noteUnavailableAt: new Date(),
      subscriptionStatus: "subscribed",
    });

    const pending = await ReminderService.getPendingReminders();
    expect(pending).toHaveLength(1);
    expect(pending[0].noteId).toBe("ok-note");

    const unavailable = await Reminder.findOne({ noteId: "gone-note" }).lean();
    const claimed = await ReminderService.claimReminderForSend(
      String(unavailable!._id),
    );
    expect(claimed).toBeNull();
  });

  it("sendReminder 遇 noteUnavailable 中止且不调用微信", async () => {
    const doc = await createPendingReminder({
      sendStatus: "sending",
      sendLockedAt: new Date(),
      noteUnavailable: true,
      noteUnavailableAt: new Date(),
      subscriptionStatus: "cancelled",
    });

    const ok = await ReminderService.sendReminder(doc.toObject() as any);
    expect(ok).toBe(false);
    expect(WeChatService.sendSubscriptionMessage).not.toHaveBeenCalled();

    const after = await Reminder.findById(doc._id).lean();
    expect(after?.sendStatus).toBe("pending");
    expect(after?.sendLockedAt).toBeNull();
    expect(after?.lastError).toMatch(/手帐/);
  });

  it("sendReminder 手帐已软删时标记 unavailable 并中止", async () => {
    const { userId } = await createAuthUser({ userId: "reminder-soft-del" });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id });
    const noteId = String(note.id);

    // 先建提醒，再软删（联动会打标）；再重置为漏标旧数据验证发送自愈
    const doc = await createPendingReminder({
      userId,
      noteId,
      sendStatus: "pending",
      subscriptionStatus: "subscribed",
    });
    await NoteService.deleteNote(noteId, userId);
    await Reminder.updateOne(
      { _id: doc._id },
      {
        $set: {
          noteUnavailable: false,
          noteUnavailableAt: null,
          subscriptionStatus: "subscribed",
          sendStatus: "sending",
          sendLockedAt: new Date(),
        },
      },
    );

    const refreshed = await Reminder.findById(doc._id).lean();
    const ok = await ReminderService.sendReminder(refreshed as any);
    expect(ok).toBe(false);
    expect(WeChatService.sendSubscriptionMessage).not.toHaveBeenCalled();

    const after = await Reminder.findById(doc._id).lean();
    expect(after?.noteUnavailable).toBe(true);
    expect(after?.subscriptionStatus).toBe("cancelled");
  });
});

describe("unit: ReminderService note lifecycle", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("markUnavailableByNoteId：未发送取消订阅；已发送仅打标", async () => {
    const userId = "lifecycle-user";
    const noteId = "lifecycle-note";
    const pending = await createPendingReminder({
      userId,
      noteId,
      subscriptionStatus: "subscribed",
      sendStatus: "pending",
    });
    const sent = await createPendingReminder({
      userId,
      noteId,
      subscriptionStatus: "subscribed",
      sendStatus: "sent",
      sentAt: new Date(),
    });

    const n = await ReminderService.markUnavailableByNoteId(noteId, userId);
    expect(n).toBe(2);

    const pendingAfter = await Reminder.findById(pending._id).lean();
    expect(pendingAfter?.noteUnavailable).toBe(true);
    expect(pendingAfter?.noteUnavailableAt).toBeTruthy();
    expect(pendingAfter?.subscriptionStatus).toBe("cancelled");
    expect(pendingAfter?.sendStatus).toBe("pending");

    const sentAfter = await Reminder.findById(sent._id).lean();
    expect(sentAfter?.noteUnavailable).toBe(true);
    expect(sentAfter?.subscriptionStatus).toBe("subscribed");
    expect(sentAfter?.sendStatus).toBe("sent");
  });

  it("clearUnavailableByNoteId 清除标记但不恢复 subscribed", async () => {
    const userId = "clear-user";
    const noteId = "clear-note";
    const doc = await createPendingReminder({
      userId,
      noteId,
      noteUnavailable: true,
      noteUnavailableAt: new Date(),
      subscriptionStatus: "cancelled",
      sendStatus: "pending",
    });

    const n = await ReminderService.clearUnavailableByNoteId(noteId, userId);
    expect(n).toBe(1);

    const after = await Reminder.findById(doc._id).lean();
    expect(after?.noteUnavailable).toBe(false);
    expect(after?.noteUnavailableAt).toBeNull();
    expect(after?.subscriptionStatus).toBe("cancelled");
  });

  it("deleteByNoteId 删除关联提醒", async () => {
    const userId = "del-user";
    const noteId = "del-note";
    await createPendingReminder({ userId, noteId });
    await createPendingReminder({ userId, noteId: "other-note" });

    const n = await ReminderService.deleteByNoteId(noteId, userId);
    expect(n).toBe(1);
    expect(await Reminder.countDocuments({ userId, noteId })).toBe(0);
    expect(await Reminder.countDocuments({ userId })).toBe(1);
  });

  it("软删手帐联动 mark；恢复 clear；purge 删除提醒", async () => {
    const { userId } = await createAuthUser({ userId: "note-link-user" });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id, title: "联动" });
    const noteId = String(note.id);

    const reminder = await createPendingReminder({
      userId,
      noteId,
      subscriptionStatus: "subscribed",
      sendStatus: "pending",
    });

    await NoteService.deleteNote(noteId, userId);
    let after = await Reminder.findById(reminder._id).lean();
    expect(after?.noteUnavailable).toBe(true);
    expect(after?.subscriptionStatus).toBe("cancelled");

    await NoteService.restoreNote(noteId, userId);
    after = await Reminder.findById(reminder._id).lean();
    expect(after?.noteUnavailable).toBe(false);
    expect(after?.subscriptionStatus).toBe("cancelled");

    await NoteService.deleteNote(noteId, userId);
    await NoteService.purgeNote(noteId, userId);
    expect(await Reminder.findById(reminder._id).lean()).toBeNull();
  });

  it("批量软删与删本连带软删均标记提醒", async () => {
    const { userId } = await createAuthUser({ userId: "batch-link-user" });
    const book = await seedNoteBook(userId);
    const n1 = await seedNote({ userId, noteBookId: book.id, title: "n1" });
    const n2 = await seedNote({ userId, noteBookId: book.id, title: "n2" });
    const r1 = await createPendingReminder({
      userId,
      noteId: String(n1.id),
      subscriptionStatus: "subscribed",
    });
    const r2 = await createPendingReminder({
      userId,
      noteId: String(n2.id),
      subscriptionStatus: "pending",
    });

    await NoteService.batchDeleteNotes([String(n1.id)], userId);
    expect((await Reminder.findById(r1._id).lean())?.noteUnavailable).toBe(true);
    expect((await Reminder.findById(r2._id).lean())?.noteUnavailable).toBe(false);

    const { NoteBookService } = await import(
      "../../../src/service/noteBook.service"
    );
    await NoteBookService.deleteNoteBook(book.id, userId);
    expect((await Reminder.findById(r2._id).lean())?.noteUnavailable).toBe(true);
    expect((await Reminder.findById(r2._id).lean())?.subscriptionStatus).toBe(
      "cancelled",
    );
  });

  it("列表透出 noteUnavailable 字段", async () => {
    const userId = "list-user";
    await createPendingReminder({
      userId,
      noteUnavailable: true,
      noteUnavailableAt: new Date("2026-07-15T08:00:00.000Z"),
      subscriptionStatus: "cancelled",
    });

    const list = await ReminderService.getUserReminders(userId);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].noteUnavailable).toBe(true);
    expect(list.items[0].noteUnavailableAt).toBeTruthy();
  });
});
