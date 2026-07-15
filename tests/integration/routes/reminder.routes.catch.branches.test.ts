import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { authHeader, createAuthUser } from "../../helpers/authFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedNote } from "../../helpers/seed/note.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";

vi.mock("../../../src/service/reminder.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/reminder.service")>();
  const S = actual.ReminderService;
  const out: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(S)) {
    if (["length", "name", "prototype"].includes(key)) continue;
    const v = (S as Record<string, unknown>)[key];
    if (typeof v === "function") {
      out[key] = vi.fn((v as (...a: unknown[]) => unknown).bind(S));
    }
  }
  return { ...actual, ReminderService: out };
});

import { ReminderService } from "../../../src/service/reminder.service";

describe("integration: reminder routes catch branches", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("Zod / 404 / service catch", async () => {
    const { token, userId } = await createAuthUser({ userId: "rem-catch-u" });
    const auth = authHeader(token);
    const nb = await seedNoteBook(userId);
    await seedNote({ userId, noteBookId: nb.id, title: "n" });

    expect((await agent.get("/reminders").set(auth).query({ page: "x" })).status).toBe(
      400,
    );
    expect((await agent.post("/reminders").set(auth).send({})).status).toBe(400);
    expect(
      (await agent.post("/reminders/batch-delete").set(auth).send({ reminderIds: [] }))
        .status,
    ).toBe(400);

    const listFn = ReminderService.getUserReminders as ReturnType<typeof vi.fn>;
    const createFn = ReminderService.createReminder as ReturnType<typeof vi.fn>;
    const getFn = ReminderService.getReminderById as ReturnType<typeof vi.fn>;
    const updateFn = ReminderService.updateReminder as ReturnType<typeof vi.fn>;
    const deleteFn = ReminderService.deleteReminder as ReturnType<typeof vi.fn>;
    const batchFn = ReminderService.batchDeleteReminders as ReturnType<typeof vi.fn>;

    listFn.mockRejectedValueOnce(new Error("boom-list"));
    expect((await agent.get("/reminders").set(auth)).status).toBeGreaterThanOrEqual(400);

    createFn.mockRejectedValueOnce(new Error("手帐不存在"));
    expect(
      (
        await agent.post("/reminders").set(auth).send({
          noteId: "000000000000000000000099",
          content: "提醒内容",
          remindTime: new Date(Date.now() + 3600_000).toISOString(),
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);

    getFn.mockResolvedValueOnce(null);
    expect(
      (await agent.get("/reminders/000000000000000000000001").set(auth)).status,
    ).toBeGreaterThanOrEqual(400);

    updateFn.mockRejectedValueOnce(new Error("提醒不存在"));
    expect(
      (
        await agent
          .put("/reminders/000000000000000000000002")
          .set(auth)
          .send({ content: "改" })
      ).status,
    ).toBeGreaterThanOrEqual(400);

    deleteFn.mockRejectedValueOnce(new Error("提醒不存在"));
    expect(
      (await agent.delete("/reminders/000000000000000000000003").set(auth)).status,
    ).toBeGreaterThanOrEqual(400);

    batchFn.mockRejectedValueOnce(new Error("boom-batch"));
    expect(
      (
        await agent
          .post("/reminders/batch-delete")
          .set(auth)
          .send({ reminderIds: ["000000000000000000000004"] })
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });
});
