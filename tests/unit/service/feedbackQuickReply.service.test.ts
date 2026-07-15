import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import {
  FeedbackQuickReplyService,
  serializeFeedbackQuickReplyItem,
} from "../../../src/service/feedbackQuickReply.service";

describe("unit: FeedbackQuickReplyService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("ensure 种子后读写与过滤 enabled", async () => {
    const admin = await FeedbackQuickReplyService.getForAdmin();
    expect(admin.items.length).toBeGreaterThan(0);

    const saved = await FeedbackQuickReplyService.setItems([
      {
        id: "qr-1",
        label: "感谢",
        content: "谢谢反馈",
        sortOrder: 1,
        enabled: true,
      },
      {
        id: "qr-2",
        label: "处理中",
        content: "正在跟进",
        sortOrder: 0,
        enabled: false,
      },
      null,
      { label: "", content: "x" },
    ]);
    expect(saved.items.length).toBe(2);
    expect(saved.items[0].label).toBe("处理中");

    const enabled = await FeedbackQuickReplyService.getEnabled();
    expect(enabled.map((x) => x.id)).toEqual(["qr-1"]);

    expect(
      serializeFeedbackQuickReplyItem(saved.items[0]).content,
    ).toBe("正在跟进");

    await expect(
      FeedbackQuickReplyService.setItems([
        { label: "a".repeat(31), content: "ok" },
      ]),
    ).rejects.toThrow(/标题/);
  });
});
