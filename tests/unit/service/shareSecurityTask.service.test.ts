import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { createAuthUser } from "../../helpers/authFactory";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import Note from "../../../src/model/Note";
import ShareSecurityTask from "../../../src/model/ShareSecurityTask";
import {
  ShareSecurityTaskService,
  SHARE_SECURITY_STUCK_MS,
} from "../../../src/service/shareSecurityTask.service";
import { WeChatContentSecurityService } from "../../../src/service/wechatContentSecurity.service";

vi.mock("../../../src/service/wechatContentSecurity.service", () => ({
  WeChatContentSecurityService: {
    checkText: vi.fn(),
  },
}));

describe("unit: ShareSecurityTaskService.handleTask", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(WeChatContentSecurityService.checkText).mockReset();
    delete process.env.SHARE_SECURITY_MAX_RETRY;
    delete process.env.SHARE_SECURITY_WORKER_INTERVAL_MS;
  });

  async function setupSharedNote(overrides: Record<string, unknown> = {}) {
    const { userId } = await createAuthUser({
      userId: `share-sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    const book = await seedNoteBook(userId);
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "分享风控手帐",
      content: "正文",
      shareId: `share-sec-${Date.now()}`,
      isShare: true,
    });
    await Note.updateOne({ _id: note.id }, { $set: { shareVersion: 3 } });
    const task = await ShareSecurityTask.create({
      taskId: `task-sec-${Date.now()}`,
      noteId: String(note.id),
      userId,
      shareVersion: 3,
      scene: "share_enable",
      source: "wechat_text",
      status: "running",
      retryCount: 0,
      nextRetryAt: new Date(),
      snapshot: {
        title: "分享风控手帐",
        content: "正文",
        tags: [],
        images: [],
        riskMeta: { source: "wechat_text" },
      },
      ...overrides,
    });
    return { note, task, userId };
  }

  it("decision=retry 不关闭分享并将任务重新入队", async () => {
    const { note, task } = await setupSharedNote();
    vi.mocked(WeChatContentSecurityService.checkText).mockResolvedValue({
      decision: "retry",
      passed: false,
      code: "WECHAT_NOT_CONFIGURED",
      detail: "微信风控未配置",
    });

    await ShareSecurityTaskService.handleTask(task);

    const noteAfter = await Note.findById(note.id).lean();
    expect(noteAfter?.isShare).toBe(true);

    const taskAfter = await ShareSecurityTask.findById(task._id).lean();
    expect(taskAfter?.status).toBe("queued");
    expect(taskAfter?.retryCount).toBe(1);
  });

  it("decision=reject 关闭分享", async () => {
    const { note, task } = await setupSharedNote();
    vi.mocked(WeChatContentSecurityService.checkText).mockResolvedValue({
      decision: "reject",
      passed: false,
      suggest: "review",
      code: "WECHAT_TEXT_REJECT",
      detail: "suggest=review",
    });

    await ShareSecurityTaskService.handleTask(task);

    const noteAfter = await Note.findById(note.id).lean();
    expect(noteAfter?.isShare).toBe(false);

    const taskAfter = await ShareSecurityTask.findById(task._id).lean();
    expect(taskAfter?.status).toBe("reject_wechat");
  });

  it("decision=pass 保持分享并通过任务", async () => {
    const { note, task } = await setupSharedNote();
    vi.mocked(WeChatContentSecurityService.checkText).mockResolvedValue({
      decision: "pass",
      passed: true,
      suggest: "pass",
    });

    await ShareSecurityTaskService.handleTask(task);

    const noteAfter = await Note.findById(note.id).lean();
    expect(noteAfter?.isShare).toBe(true);

    const taskAfter = await ShareSecurityTask.findById(task._id).lean();
    expect(taskAfter?.status).toBe("pass");
  });

  it("decision=pass + suggest=risky 标记 risky_wechat 且不关分享", async () => {
    const { note, task } = await setupSharedNote();
    vi.mocked(WeChatContentSecurityService.checkText).mockResolvedValue({
      decision: "pass",
      passed: true,
      suggest: "risky",
      code: "WECHAT_TEXT_RISKY",
      detail: "suggest=risky",
      traceId: "tr-1",
    });

    await ShareSecurityTaskService.handleTask(task);

    const noteAfter = await Note.findById(note.id).lean();
    expect(noteAfter?.isShare).toBe(true);
    const taskAfter = await ShareSecurityTask.findById(task._id).lean();
    expect(taskAfter?.status).toBe("risky_wechat");
    expect(taskAfter?.resultCode).toBe("WECHAT_TEXT_RISKY");
  });

  it("reject 时 shareVersion 不匹配则不关分享", async () => {
    const { note, task } = await setupSharedNote();
    await Note.updateOne({ _id: note.id }, { $set: { shareVersion: 9 } });
    vi.mocked(WeChatContentSecurityService.checkText).mockResolvedValue({
      decision: "reject",
      passed: false,
      code: "WECHAT_TEXT_REJECT",
      detail: "bad",
    });

    await ShareSecurityTaskService.handleTask(task);

    const noteAfter = await Note.findById(note.id).lean();
    expect(noteAfter?.isShare).toBe(true);
    const taskAfter = await ShareSecurityTask.findById(task._id).lean();
    expect(taskAfter?.status).toBe("reject_wechat");
  });

  it("wechat_image 源跳过检测直接 pass", async () => {
    const { note, task } = await setupSharedNote({ source: "wechat_image" });
    await ShareSecurityTaskService.handleTask(task);
    expect(WeChatContentSecurityService.checkText).not.toHaveBeenCalled();
    const noteAfter = await Note.findById(note.id).lean();
    expect(noteAfter?.isShare).toBe(true);
    const taskAfter = await ShareSecurityTask.findById(task._id).lean();
    expect(taskAfter?.status).toBe("pass");
    expect(taskAfter?.resultCode).toBe("WECHAT_IMAGE_CHECK_DISABLED");
  });

  it("未知 source 走 LOCAL_PASS", async () => {
    const { task } = await setupSharedNote({ source: "local" });
    await ShareSecurityTaskService.handleTask(task);
    const taskAfter = await ShareSecurityTask.findById(task._id).lean();
    expect(taskAfter?.status).toBe("pass");
    expect(taskAfter?.resultCode).toBe("LOCAL_PASS");
  });

  it("checkText 抛错进入重试；耗尽标记 error 但不关闭分享", async () => {
    process.env.SHARE_SECURITY_MAX_RETRY = "1";
    const { note, task } = await setupSharedNote();
    vi.mocked(WeChatContentSecurityService.checkText).mockRejectedValue(
      new Error("network down"),
    );

    await ShareSecurityTaskService.handleTask(task);

    const noteAfter = await Note.findById(note.id).lean();
    expect(noteAfter?.isShare).toBe(true);
    const taskAfter = await ShareSecurityTask.findById(task._id).lean();
    expect(taskAfter?.status).toBe("error");
    expect(taskAfter?.resultCode).toBe("TASK_RETRY_EXHAUSTED");
    expect(taskAfter?.resultDetail).toMatch(/network down/);
  });

  it("retry 耗尽标记 error 但不关闭分享", async () => {
    process.env.SHARE_SECURITY_MAX_RETRY = "1";
    const { note, task } = await setupSharedNote();
    task.retryCount = 0;
    await task.save();

    vi.mocked(WeChatContentSecurityService.checkText).mockResolvedValue({
      decision: "retry",
      passed: false,
      code: "WECHAT_TEXT_REQUEST_ERROR",
      detail: "timeout",
    });

    await ShareSecurityTaskService.handleTask(task);

    const noteAfter = await Note.findById(note.id).lean();
    expect(noteAfter?.isShare).toBe(true);

    const taskAfter = await ShareSecurityTask.findById(task._id).lean();
    expect(taskAfter?.status).toBe("error");
    expect(taskAfter?.resultCode).toBe("TASK_RETRY_EXHAUSTED");

    delete process.env.SHARE_SECURITY_MAX_RETRY;
  });

  it("MAX_RETRY 非法值回退为 3（可再次入队）", async () => {
    process.env.SHARE_SECURITY_MAX_RETRY = "0";
    const { task } = await setupSharedNote();
    vi.mocked(WeChatContentSecurityService.checkText).mockResolvedValue({
      decision: "retry",
      passed: false,
      code: "RETRY",
      detail: "again",
    });
    await ShareSecurityTaskService.handleTask(task);
    const after = await ShareSecurityTask.findById(task._id).lean();
    // Number(0)||3 => 3，首次 retry 仍 queued
    expect(after?.status).toBe("queued");
    expect(after?.retryCount).toBe(1);
  });
});

describe("unit: ShareSecurityTaskService enqueue/record/risk map", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("recordLocalReject 写入 reject_local 快照并过滤空图片", async () => {
    const { userId } = await createAuthUser({ userId: "local-reject-u" });
    await ShareSecurityTaskService.recordLocalReject({
      noteId: "note-local-1",
      userId,
      shareVersion: 1,
      reason: "命中敏感词",
      title: "标题",
      content: "内容",
      tags: ["a", "b"],
      images: [
        { url: " https://cdn/a.png ", key: "k1", thumbUrl: "t1" },
        { url: "  ", key: "skip" },
        { key: "no-url" },
      ],
    });

    const doc = await ShareSecurityTask.findOne({ noteId: "note-local-1" }).lean();
    expect(doc?.status).toBe("reject_local");
    expect(doc?.source).toBe("local");
    expect(doc?.resultCode).toBe("LOCAL_SENSITIVE_WORD");
    expect(doc?.snapshot?.images).toHaveLength(1);
    expect(doc?.snapshot?.images?.[0].url).toBe("https://cdn/a.png");
    expect(doc?.snapshot?.tags).toEqual(["a", "b"]);
  });

  it("enqueueWeChatChecks 入队文本任务并生成 digest", async () => {
    const { userId } = await createAuthUser({ userId: "enqueue-u" });
    await ShareSecurityTaskService.enqueueWeChatChecks({
      noteId: "note-enq-1",
      userId,
      shareVersion: 2,
      title: "题",
      content: "正",
      tags: ["t"],
      images: [{ url: "https://cdn/i.png" }],
    });

    const doc = await ShareSecurityTask.findOne({ noteId: "note-enq-1" }).lean();
    expect(doc?.source).toBe("wechat_text");
    expect(doc?.status).toBe("queued");
    expect(doc?.imageCount).toBe(1);
    expect(doc?.textPayloadDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("getLatestRiskSummary / mapTaskStatusToRiskStatus 全分支", async () => {
    expect(await ShareSecurityTaskService.getLatestRiskSummary("none")).toEqual({
      riskStatus: "none",
      riskUpdatedAt: null,
    });

    const statuses = [
      "pass",
      "risky_wechat",
      "reject_local",
      "reject_wechat",
      "error",
      "queued",
    ] as const;
    for (const status of statuses) {
      expect(ShareSecurityTaskService.mapTaskStatusToRiskStatus(status)).toBe(
        status === "queued" ? "none" : status,
      );
    }

    const { userId } = await createAuthUser({ userId: "risk-sum-u" });
    await ShareSecurityTask.create({
      taskId: "task-risk-1",
      noteId: "note-risk-1",
      userId,
      shareVersion: 1,
      scene: "share_enable",
      source: "wechat_text",
      status: "reject_wechat",
      resultCode: "WECHAT_TEXT_REJECT",
      snapshot: {
        title: "t",
        content: "c",
        tags: [],
        images: [],
        riskMeta: { source: "wechat_text" },
      },
    });
    const summary = await ShareSecurityTaskService.getLatestRiskSummary(
      "note-risk-1",
    );
    expect(summary.riskStatus).toBe("reject_wechat");
    expect(summary.riskReason).toBe("WECHAT_TEXT_REJECT");
    expect(summary.riskUpdatedAt).toBeTruthy();
  });

  it("startWorker 幂等只启动一次", () => {
    const spy = vi.spyOn(global, "setInterval").mockReturnValue(1 as never);
    ShareSecurityTaskService.startWorker();
    ShareSecurityTaskService.startWorker();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("unit: ShareSecurityTaskService stuck reclaim", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(WeChatContentSecurityService.checkText).mockReset();
    vi.mocked(WeChatContentSecurityService.checkText).mockResolvedValue({
      decision: "pass",
      passed: true,
      suggest: "pass",
    });
  });

  async function seedTask(overrides: Record<string, unknown> = {}) {
    const { userId } = await createAuthUser({
      userId: `share-reclaim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    const book = await seedNoteBook(userId);
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "reclaim",
      content: "body",
      shareId: `share-reclaim-${Date.now()}`,
      isShare: true,
    });
    const task = await ShareSecurityTask.create({
      taskId: `task-reclaim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      noteId: String(note.id),
      userId,
      shareVersion: 1,
      scene: "share_enable",
      source: "wechat_text",
      status: "running",
      retryCount: 0,
      nextRetryAt: new Date(),
      snapshot: {
        title: "reclaim",
        content: "body",
        tags: [],
        images: [],
        riskMeta: { source: "wechat_text" },
      },
      ...overrides,
    });
    return task;
  }

  it("过期 running 可被回收并重新处理", async () => {
    const stale = new Date(Date.now() - SHARE_SECURITY_STUCK_MS - 1000);
    const task = await seedTask({ lockedAt: stale });

    await ShareSecurityTaskService.runOnceForTest();

    const after = await ShareSecurityTask.findById(task._id).lean();
    expect(after?.status).toBe("pass");
    expect(after?.lockedAt == null).toBe(true);
  });

  it("未超时的 running 不被回收", async () => {
    const task = await seedTask({ lockedAt: new Date() });

    await ShareSecurityTaskService.runOnceForTest();

    const after = await ShareSecurityTask.findById(task._id).lean();
    expect(after?.status).toBe("running");
    expect(WeChatContentSecurityService.checkText).not.toHaveBeenCalled();
  });

  it("终态 pass 不被回收", async () => {
    const stale = new Date(Date.now() - SHARE_SECURITY_STUCK_MS - 1000);
    const task = await seedTask({
      status: "pass",
      lockedAt: stale,
    });

    await ShareSecurityTaskService.runOnceForTest();

    const after = await ShareSecurityTask.findById(task._id).lean();
    expect(after?.status).toBe("pass");
    expect(WeChatContentSecurityService.checkText).not.toHaveBeenCalled();
  });

  it("无 lockedAt 的遗留 running 可被捞起", async () => {
    const task = await seedTask({});

    await ShareSecurityTaskService.runOnceForTest();

    const after = await ShareSecurityTask.findById(task._id).lean();
    expect(after?.status).toBe("pass");
  });

  it("queued 且 nextRetryAt 未到期则不捞起", async () => {
    const task = await seedTask({
      status: "queued",
      nextRetryAt: new Date(Date.now() + 60_000),
      lockedAt: null,
    });

    await ShareSecurityTaskService.runOnceForTest();

    const after = await ShareSecurityTask.findById(task._id).lean();
    expect(after?.status).toBe("queued");
    expect(WeChatContentSecurityService.checkText).not.toHaveBeenCalled();
  });

  it("error 态且 nextRetryAt 到期可重新处理", async () => {
    const task = await seedTask({
      status: "error",
      nextRetryAt: new Date(Date.now() - 1000),
      lockedAt: null,
      retryCount: 1,
    });

    await ShareSecurityTaskService.runOnceForTest();

    const after = await ShareSecurityTask.findById(task._id).lean();
    expect(after?.status).toBe("pass");
  });

  it("runOnce 并发互斥：第二次调用直接返回", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(WeChatContentSecurityService.checkText).mockImplementation(
      async () => {
        await gate;
        return { decision: "pass", passed: true, suggest: "pass" };
      },
    );

    const stale = new Date(Date.now() - SHARE_SECURITY_STUCK_MS - 1000);
    await seedTask({ lockedAt: stale });

    const first = ShareSecurityTaskService.runOnceForTest();
    const second = ShareSecurityTaskService.runOnceForTest();
    release();
    await Promise.all([first, second]);

    expect(WeChatContentSecurityService.checkText).toHaveBeenCalledTimes(1);
  });
});

describe("unit: ShareSecurityTaskService cancel/delete + deleted-note guard", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(WeChatContentSecurityService.checkText).mockReset();
  });

  it("cancelByNoteId 仅删除未完成任务，保留终态", async () => {
    const { userId } = await createAuthUser({
      userId: `sec-cancel-${Date.now()}`,
    });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id, title: "n" });
    const noteId = String(note.id);
    await ShareSecurityTask.create([
      {
        taskId: "q1",
        noteId,
        userId,
        shareVersion: 1,
        scene: "share_enable",
        source: "wechat_text",
        status: "queued",
        retryCount: 0,
        snapshot: {
          title: "t",
          content: "c",
          tags: [],
          images: [],
          riskMeta: { source: "wechat_text" },
        },
      },
      {
        taskId: "p1",
        noteId,
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
      },
    ]);

    expect(await ShareSecurityTaskService.cancelByNoteId(noteId, userId)).toBe(1);
    expect(await ShareSecurityTask.countDocuments({ noteId, status: "queued" })).toBe(0);
    expect(await ShareSecurityTask.countDocuments({ noteId, status: "pass" })).toBe(1);

    expect(await ShareSecurityTaskService.deleteByNoteId(noteId, userId)).toBe(1);
    expect(await ShareSecurityTask.countDocuments({ noteId })).toBe(0);
  });

  it("cancelByNoteIds / deleteByNoteIds 空入参返回 0", async () => {
    expect(await ShareSecurityTaskService.cancelByNoteIds([], "u")).toBe(0);
    expect(await ShareSecurityTaskService.deleteByNoteIds([], "u")).toBe(0);
    expect(await ShareSecurityTaskService.cancelByNoteId("", "u")).toBe(0);
  });

  it("handleTask 遇软删手帐丢弃任务且不调微信", async () => {
    const { userId } = await createAuthUser({
      userId: `sec-soft-${Date.now()}`,
    });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id, title: "n" });
    await Note.updateOne({ _id: note.id }, { $set: { isDeleted: true } });
    const task = await ShareSecurityTask.create({
      taskId: `task-soft-${Date.now()}`,
      noteId: String(note.id),
      userId,
      shareVersion: 1,
      scene: "share_enable",
      source: "wechat_text",
      status: "running",
      retryCount: 0,
      snapshot: {
        title: "t",
        content: "c",
        tags: [],
        images: [],
        riskMeta: { source: "wechat_text" },
      },
    });

    await ShareSecurityTaskService.handleTask(task);

    expect(WeChatContentSecurityService.checkText).not.toHaveBeenCalled();
    expect(await ShareSecurityTask.findById(task._id)).toBeNull();
  });

  it("handleTask 遇手帐已硬删丢弃任务", async () => {
    const { userId } = await createAuthUser({
      userId: `sec-gone-${Date.now()}`,
    });
    const task = await ShareSecurityTask.create({
      taskId: `task-gone-${Date.now()}`,
      noteId: "000000000000000000000001",
      userId,
      shareVersion: 1,
      scene: "share_enable",
      source: "wechat_text",
      status: "running",
      retryCount: 0,
      snapshot: {
        title: "t",
        content: "c",
        tags: [],
        images: [],
        riskMeta: { source: "wechat_text" },
      },
    });

    await ShareSecurityTaskService.handleTask(task);

    expect(WeChatContentSecurityService.checkText).not.toHaveBeenCalled();
    expect(await ShareSecurityTask.findById(task._id)).toBeNull();
  });
});
