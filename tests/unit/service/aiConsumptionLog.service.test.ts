import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { AiConsumptionLogService } from "../../../src/service/aiConsumptionLog.service";

describe("unit: AiConsumptionLogService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("record journal/template 并可按用户列表", async () => {
    const { userId } = await seedUser({ userId: "ai-log-u1" });
    await AiConsumptionLogService.recordJournalSuccess({
      userId,
      dateKey: "2026-07-15",
      mode: "generate",
      styleKey: "journal_default",
      systemPrompt: "sys",
      userPrompt: "user",
      rawOutputText: "raw",
      outputText: "out",
    });
    await AiConsumptionLogService.recordTemplateSuccess({
      userId,
      dateKey: "2026-07-15",
      mode: "polish",
      systemPrompt: "sys2",
      userPrompt: "user2",
      rawOutputText: "raw2",
      outputText: "out2",
    });

    const listed = await AiConsumptionLogService.listForAdmin({
      page: 1,
      limit: 10,
      userId,
      dateKeyFrom: "2026-07-15",
      dateKeyTo: "2026-07-15",
    });
    expect(listed.total).toBe(2);
    expect(listed.items.some((x) => x.source === "journal")).toBe(true);
    expect(listed.items[0].mongoUserId).toBeTruthy();
  });
});
