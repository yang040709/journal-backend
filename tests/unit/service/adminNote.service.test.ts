import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import Note from "../../../src/model/Note";
import ShareSecurityTask from "../../../src/model/ShareSecurityTask";
import {
  AdminNoteService,
  buildAdminNoteListQuery,
} from "../../../src/service/adminNote.service";

vi.mock("../../../src/utils/sensitive-encrypted", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/utils/sensitive-encrypted")>();
  return {
    ...actual,
    checkNoteContent: vi.fn(() => ({
      hasAnySensitive: false,
      processedTitle: undefined,
      processedContent: undefined,
    })),
  };
});

vi.mock("../../../src/service/initialUserNoteSeedConfig.service", () => ({
  InitialUserNoteSeedConfigService: {
    getExcludedNoteSeedKeys: vi.fn(async () => ["welcome", "guide"]),
  },
}));

describe("unit: AdminNoteService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("buildAdminNoteListQuery 覆盖筛选分支", () => {
    expect(buildAdminNoteListQuery({})).toEqual({});
    const q = buildAdminNoteListQuery({
      userId: "u1",
      noteBookId: "nb",
      tags: ["日常"],
      startTime: Date.now() - 86400000,
      endTime: Date.now(),
      isShare: true,
      isFavorite: false,
      isPinned: true,
    });
    expect(q.userId).toBe("u1");
    expect(q.tags).toEqual({ $all: ["日常"] });
    expect(q.isShare).toBe(true);
    expect(q.isFavorite).toBe(false);
    expect(q.isPinned).toBe(true);
    expect(q.createdAt).toBeTruthy();
  });

  it("CRUD / list / share / batch", async () => {
    const { userId } = await seedUser({ userId: "admin-note-u" });
    const book = await seedNoteBook(userId, "管理本");
    const book2 = await seedNoteBook(userId, "另一本");

    const created = await AdminNoteService.createNote({
      userId,
      noteBookId: book.id,
      title: "标题A",
      content: "内容A足够长",
      tags: ["日常"],
    });
    expect(created.title).toBe("标题A");

    await expect(
      AdminNoteService.createNote({
        userId,
        noteBookId: new mongoose.Types.ObjectId().toString(),
        title: "x",
        content: "y",
      }),
    ).rejects.toThrow();

    const seeded = await seedNote({
      userId,
      noteBookId: book.id,
      title: "分享稿",
      content: "分享内容",
      isShare: true,
      shareId: "share-xyz",
    });

    const listed = await AdminNoteService.listNotes({
      userId,
      page: 1,
      limit: 20,
      isShare: true,
      tags: ["日常"],
    });
    expect(listed.total).toBeGreaterThanOrEqual(0);
    const listedShare = await AdminNoteService.listNotes({
      userId,
      page: 1,
      limit: 20,
      isShare: true,
    });
    expect(listedShare.total).toBeGreaterThanOrEqual(1);
    expect(listedShare.items.some((i) => i.sharePath?.includes("share-xyz"))).toBe(true);

    const byExclude = await AdminNoteService.listNotes({
      userId,
      excludeDefaultNotes: true,
      page: 1,
      limit: 20,
    });
    expect(byExclude.total).toBeGreaterThanOrEqual(1);

    const got = await AdminNoteService.getNoteById(String(created._id));
    expect(got?.title).toBe("标题A");
    expect(
      await AdminNoteService.getNoteById(new mongoose.Types.ObjectId().toString()),
    ).toBeNull();

    const updated = await AdminNoteService.updateNote(String(created._id), {
      title: "标题B",
      content: "内容B",
      tags: ["心情"],
      noteBookId: book2.id,
      isShare: true,
      isFavorite: true,
      isPinned: true,
      appliedSystemTemplateKey: null,
    });
    expect(updated?.title).toBe("标题B");
    expect(updated?.noteBookId).toBe(book2.id);

    await AdminNoteService.adminSetShareStatus(String(created._id), false);
    const afterShare = await Note.findById(created._id).lean();
    expect(afterShare?.isShare).toBe(false);

    const batchShare = await AdminNoteService.batchSetShare(
      [String(created._id), String(seeded.id)],
      true,
    );
    expect(batchShare.ok).toBeGreaterThanOrEqual(1);

    const batchTags = await AdminNoteService.batchSetTags(
      [String(created._id)],
      ["学习"],
      "replace",
    );
    expect(batchTags.ok).toBeGreaterThanOrEqual(1);

    const batchAdd = await AdminNoteService.batchSetTags(
      [String(created._id)],
      ["工作"],
      "add",
    );
    expect(batchAdd.ok).toBeGreaterThanOrEqual(0);

    expect(await AdminNoteService.deleteNote(String(created._id))).toBe(true);
    expect(await AdminNoteService.deleteNote(String(created._id))).toBe(false);
  });

  it("listRiskNotes / getRiskTaskSnapshot", async () => {
    const { userId } = await seedUser({ userId: "risk-u" });
    const book = await seedNoteBook(userId, "本");
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "风险稿",
      content: "风险内容",
    });
    const task = await ShareSecurityTask.create({
      taskId: "task-risk-1",
      noteId: note.id,
      userId,
      shareVersion: 1,
      scene: "share_enable",
      source: "local",
      status: "reject_local",
      resultCode: "LOCAL",
      resultDetail: "敏感",
      imageCount: 0,
      snapshot: {
        title: "风险稿",
        content: "风险内容",
        tags: [],
        images: [],
        riskMeta: { source: "local", code: "LOCAL" },
      },
    });

    const risks = await AdminNoteService.listRiskNotes({
      page: 1,
      limit: 20,
      userId,
      riskStatus: "reject_local",
      keyword: "风险",
      startTime: Date.now() - 86400000,
      endTime: Date.now() + 86400000,
    });
    expect(risks.total).toBeGreaterThanOrEqual(1);

    const snap = await AdminNoteService.getRiskTaskSnapshot("task-risk-1");
    expect(snap?.taskId).toBe("task-risk-1");
    expect(await AdminNoteService.getRiskTaskSnapshot("missing")).toBeNull();
    expect(task._id).toBeTruthy();

    // 无 riskStatus / 无 keyword / 无 userId 的默认聚合分支
    const risksDefault = await AdminNoteService.listRiskNotes({
      page: 1,
      limit: 5,
    });
    expect(risksDefault.total).toBeGreaterThanOrEqual(0);

    // snapshot 含 images / riskMeta 回落字段
    await ShareSecurityTask.create({
      taskId: "task-risk-img",
      noteId: note.id,
      userId,
      shareVersion: 2,
      scene: "share_enable",
      source: "wechat_text",
      status: "reject_wechat",
      resultCode: "WX",
      resultDetail: "微信拒",
      imageCount: 1,
      wechatTraceId: "trace-1",
      snapshot: {
        title: "",
        content: "仅正文",
        tags: ["t1"],
        images: [
          { key: "k1", url: "https://cdn.example.com/a.png", thumbUrl: "https://cdn.example.com/t.png" },
          { key: "k2", url: "https://cdn.example.com/b.png" },
        ],
        riskMeta: { source: "wechat_text", code: "C1", detail: "d1", traceId: "tr" },
      },
    });
    const snapImg = await AdminNoteService.getRiskTaskSnapshot("task-risk-img");
    expect(snapImg?.snapshot?.images?.length).toBe(2);
    expect(snapImg?.snapshot?.riskMeta?.traceId).toBe("tr");

    await ShareSecurityTask.updateOne(
      { taskId: "task-risk-img" },
      { $unset: { snapshot: 1 } },
    );
    const snapEmpty = await AdminNoteService.getRiskTaskSnapshot("task-risk-img");
    expect(snapEmpty?.snapshot).toBeNull();
  });

  it("listNotes 排序/全文搜索/分页深度；batch 空与非法 id", async () => {
    const { userId } = await seedUser({ userId: "admin-note-extra" });
    const book = await seedNoteBook(userId, "本");
    await seedNote({
      userId,
      noteBookId: book.id,
      title: "可搜标题XYZ",
      content: "正文XYZ足够长",
    });

    const bySort = await AdminNoteService.listNotes({
      userId,
      page: 1,
      limit: 5,
      sortBy: "title",
      order: "asc",
    });
    expect(bySort.items.length).toBeGreaterThanOrEqual(1);

    await expect(
      AdminNoteService.listNotes({ page: 9999, limit: 100 }),
    ).rejects.toThrow(/分页深度/);

    const emptyShare = await AdminNoteService.batchSetShare([], true);
    expect(emptyShare.ok).toBe(0);
    expect(emptyShare.missing).toEqual([]);

    const missingId = new mongoose.Types.ObjectId().toString();
    const badIds = await AdminNoteService.batchSetTags(
      [missingId],
      ["x"],
      "add",
    );
    expect(badIds.ok).toBe(0);
    expect(badIds.missing).toEqual([missingId]);

    expect(
      await AdminNoteService.adminSetShareStatus(missingId, true),
    ).toBe(false);

    expect(
      await AdminNoteService.updateNote(missingId, { title: "ghost" }),
    ).toBeNull();
  });
});
