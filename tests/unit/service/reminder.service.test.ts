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
    const doc = await createPendingReminder();
    vi.mocked(WeChatService.sendSubscriptionMessage).mockResolvedValue(false);

    const ok = await ReminderService.sendReminder(doc.toObject() as any);
    expect(ok).toBe(false);

    const after = await Reminder.findById(doc._id).lean();
    expect(after?.retryCount).toBe(1);
    expect(after?.sendStatus).toBe("pending");
    expect(after?.lastError).toBeTruthy();
  });

  it("第三次失败标记为 failed", async () => {
    const doc = await createPendingReminder({ retryCount: 2 });
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
    const doc = await createPendingReminder();
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
});
