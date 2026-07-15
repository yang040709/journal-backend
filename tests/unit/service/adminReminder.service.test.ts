import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import Reminder from "../../../src/model/Reminder";
import { AdminReminderService } from "../../../src/service/adminReminder.service";

describe("unit: AdminReminderService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  async function seedReminder(overrides: Record<string, unknown> = {}) {
    return Reminder.create({
      userId: "admin-rem-u1",
      noteId: "note-1",
      title: "t",
      content: "c",
      remindTime: new Date("2026-07-01T10:00:00Z"),
      messageId: "m1",
      subscriptionStatus: "subscribed",
      sendStatus: "failed",
      retryCount: 2,
      lastError: "boom",
      ...overrides,
    });
  }

  it("list / get / update / delete 覆盖主路径", async () => {
    const a = await seedReminder();
    await seedReminder({
      noteId: "note-2",
      sendStatus: "pending",
      subscriptionStatus: "pending",
      retryCount: 0,
      lastError: "",
      remindTime: new Date("2026-07-02T10:00:00Z"),
    });

    const listed = await AdminReminderService.listReminders({
      page: 1,
      limit: 10,
      userId: "admin-rem-u1",
      noteId: "note-1",
      sendStatus: "failed",
      subscriptionStatus: "subscribed",
      remindTimeFrom: new Date("2026-06-01T00:00:00Z"),
      remindTimeTo: new Date("2026-08-01T00:00:00Z"),
      sortBy: "remindTime",
      order: "asc",
    });
    expect(listed.total).toBe(1);
    expect(listed.items[0].id).toBe(String(a._id));
    expect(listed.items[0].lastError).toBe("boom");

    expect(await AdminReminderService.getReminderById(String(a._id))).toMatchObject(
      { noteId: "note-1" },
    );
    expect(await AdminReminderService.getReminderById("000000000000000000000000")).toBeNull();

    const updated = await AdminReminderService.updateReminder(String(a._id), {
      content: "  next  ",
      remindTime: new Date("2026-07-03T00:00:00Z"),
      resetFailedToPending: true,
    });
    expect(updated?.content).toBe("next");
    expect(updated?.sendStatus).toBe("pending");
    expect(updated?.retryCount).toBe(0);
    expect(updated?.lastError).toBe("");

    expect(
      await AdminReminderService.updateReminder("000000000000000000000000", {
        content: "x",
      }),
    ).toBeNull();

    expect(await AdminReminderService.deleteReminder(String(a._id))).toBe(true);
    expect(await AdminReminderService.deleteReminder(String(a._id))).toBe(false);
  });
});
