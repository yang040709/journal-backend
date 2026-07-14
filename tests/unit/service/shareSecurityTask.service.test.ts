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
  });

  async function setupSharedNote() {
    const { userId } = await createAuthUser({ userId: "share-sec-owner" });
    const book = await seedNoteBook(userId);
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "分享风控手帐",
      content: "正文",
      shareId: "share-sec-001",
      isShare: true,
    });
    await Note.updateOne({ _id: note.id }, { $set: { shareVersion: 3 } });
    const task = await ShareSecurityTask.create({
      taskId: "task-sec-001",
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
    });
    return { note, task };
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
    const { userId } = await createAuthUser({ userId: `share-reclaim-${Date.now()}` });
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
});
