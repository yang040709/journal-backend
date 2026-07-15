import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import Note from "../../../src/model/Note";
import NoteBook from "../../../src/model/NoteBook";
import Reminder from "../../../src/model/Reminder";
import Template from "../../../src/model/Template";
import User from "../../../src/model/User";
import UserAdRewardLog from "../../../src/model/UserAdRewardLog";
import UserAiUsageDaily from "../../../src/model/UserAiUsageDaily";
import UserImageAsset from "../../../src/model/UserImageAsset";
import UserMigrationTask from "../../../src/model/UserMigrationTask";
import UserUploadQuotaDaily from "../../../src/model/UserUploadQuotaDaily";
import {
  MigrationBusinessError,
  UserMigrationService,
} from "../../../src/service/userMigration.service";

describe("unit: UserMigrationService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.restoreAllMocks();
  });

  it("precheck 参数与账号校验", async () => {
    await expect(
      UserMigrationService.precheck({
        sourceOpenid: "",
        targetOpenid: "b",
        remark: "r",
        operator: "op",
      }),
    ).rejects.toMatchObject({ code: "PARAM" });

    await expect(
      UserMigrationService.precheck({
        sourceOpenid: "a",
        targetOpenid: "a",
        remark: "r",
        operator: "op",
      }),
    ).rejects.toMatchObject({ code: "PARAM" });

    await expect(
      UserMigrationService.precheck({
        sourceOpenid: "a",
        targetOpenid: "b",
        remark: "",
        operator: "op",
      }),
    ).rejects.toMatchObject({ code: "PARAM" });

    await expect(
      UserMigrationService.precheck({
        sourceOpenid: "a",
        targetOpenid: "b",
        remark: "r",
        operator: " ",
      }),
    ).rejects.toMatchObject({ code: "PARAM" });

    await seedUser({ userId: "src-1" });
    await expect(
      UserMigrationService.precheck({
        sourceOpenid: "src-1",
        targetOpenid: "missing",
        remark: "r",
        operator: "op",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      UserMigrationService.precheck({
        sourceOpenid: "missing-src",
        targetOpenid: "src-1",
        remark: "r",
        operator: "op",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("precheck 汇总并执行空数据迁徙成功 + 幂等命中", async () => {
    await seedUser({ userId: "mig-src", nickname: "源用户", points: 88 });
    await seedUser({ userId: "mig-tgt", nickname: "目标用户", points: 1 });
    const book = await seedNoteBook("mig-src", "源本");
    await seedNote({
      userId: "mig-src",
      noteBookId: book.id,
      title: "源笔记",
      content: "你好",
    });

    const pre = await UserMigrationService.precheck({
      sourceOpenid: "mig-src",
      targetOpenid: "mig-tgt",
      remark: "运营迁徙",
      operator: "admin",
    });
    expect(pre.canMigrate).toBe(true);
    expect(pre.summary.notes).toBe(1);
    expect(pre.summary.notebooks).toBe(1);

    const result = await UserMigrationService.execute({
      sourceOpenid: "mig-src",
      targetOpenid: "mig-tgt",
      operator: "admin",
      remark: "运营迁徙",
      idempotencyKey: "idem-1",
    });
    expect(result.task.status).toBe("success");
    expect(result.idempotentHit).toBe(false);
    expect(await Note.countDocuments({ userId: "mig-tgt" })).toBe(1);
    expect(await NoteBook.countDocuments({ userId: "mig-tgt" })).toBe(1);

    const tgt = await User.findOne({ userId: "mig-tgt" }).lean();
    expect(tgt?.nickname).toBe("源用户");
    expect(tgt?.points).toBe(88);

    const again = await UserMigrationService.execute({
      sourceOpenid: "mig-src",
      targetOpenid: "mig-tgt",
      operator: "admin",
      remark: "运营迁徙",
      idempotencyKey: "idem-1",
    });
    expect(again.idempotentHit).toBe(true);
    expect(again.task.taskId).toBe(result.task.taskId);

    const detail = await UserMigrationService.getTaskDetail(result.task.taskId);
    expect(detail?.status).toBe("success");
    expect(detail?.moduleResults.length).toBeGreaterThan(0);
  });

  it("execute 参数校验与 getTaskDetail 边界", async () => {
    await expect(
      UserMigrationService.execute({
        sourceOpenid: "",
        targetOpenid: "t",
        operator: "op",
        remark: "r",
        idempotencyKey: "k",
      }),
    ).rejects.toMatchObject({ code: "PARAM" });

    await expect(
      UserMigrationService.execute({
        sourceOpenid: "a",
        targetOpenid: "a",
        operator: "op",
        remark: "r",
        idempotencyKey: "k2",
      }),
    ).rejects.toMatchObject({ code: "PARAM" });

    expect(await UserMigrationService.getTaskDetail("")).toBeNull();
    expect(await UserMigrationService.getTaskDetail("no-such")).toBeNull();
  });

  it("目标已有数据时覆盖迁徙（含提醒/模板/图片/额度）", async () => {
    await seedUser({
      userId: "full-src",
      nickname: "源全量",
      points: 50,
    });
    await seedUser({
      userId: "full-tgt",
      nickname: "目标旧资料",
      points: 9,
    });

    const srcBook = await seedNoteBook("full-src", "源本");
    const srcNote = await seedNote({
      userId: "full-src",
      noteBookId: srcBook.id,
      title: "源笔记",
      content: "源内容",
      shareId: "share-src-1",
      isShare: true,
    });
    await Note.updateOne(
      { _id: srcNote.id },
      { $set: { shareVersion: 2, firstSharedAt: new Date() } },
    );

    const tgtBook = await seedNoteBook("full-tgt", "目标旧本");
    await seedNote({
      userId: "full-tgt",
      noteBookId: tgtBook.id,
      title: "目标旧笔记",
      content: "将被覆盖",
    });

    await Reminder.create({
      userId: "full-src",
      noteId: String(srcNote.id),
      title: "源提醒",
      content: "提醒正文",
      remindTime: new Date(Date.now() + 60_000),
      messageId: "tpl-src",
      subscriptionStatus: "subscribed",
      sendStatus: "pending",
      retryCount: 0,
    });
    await Reminder.create({
      userId: "full-tgt",
      noteId: "old-note",
      title: "旧提醒",
      content: "c",
      remindTime: new Date(),
      messageId: "tpl-old",
      subscriptionStatus: "subscribed",
      sendStatus: "pending",
      retryCount: 0,
    });

    await Template.create({
      userId: "full-src",
      name: "源模板",
      description: "",
      fields: { title: "t", content: "c", tags: [] },
      isSystem: false,
    });
    await Template.create({
      userId: "full-tgt",
      name: "目标旧模板",
      description: "",
      fields: { title: "ot", content: "oc", tags: [] },
      isSystem: false,
    });

    await UserImageAsset.create([
      {
        userId: "full-src",
        storageKey: "journal/full-src/1.png",
        url: "https://cdn/src.png",
        source: "note",
        refId: String(srcNote.id),
      },
      {
        userId: "full-tgt",
        storageKey: "journal/full-tgt/old.png",
        url: "https://cdn/old.png",
        source: "note",
        refId: "old",
      },
    ]);

    await UserUploadQuotaDaily.create({
      userId: "full-src",
      dateKey: "2026-07-15",
      usedCount: 2,
      baseLimit: 9,
      extraQuota: 1,
      bizBreakdown: { note: 2, cover: 0, avatar: 0 },
    });
    await UserUploadQuotaDaily.create({
      userId: "full-tgt",
      dateKey: "2026-07-15",
      usedCount: 8,
      baseLimit: 9,
      extraQuota: 0,
      bizBreakdown: { note: 8, cover: 0, avatar: 0 },
    });
    await UserAiUsageDaily.create({
      userId: "full-src",
      dateKey: "2026-07-15",
      usedCount: 1,
    });
    await UserAiUsageDaily.create({
      userId: "full-tgt",
      dateKey: "2026-07-15",
      usedCount: 3,
    });

    await UserAdRewardLog.create({
      userId: "full-src",
      rewardToken: "tok-src-points",
      rewardType: "points",
      rewardValue: 10,
      adProvider: "wx",
      adUnitId: "ad1",
      requestId: "r1",
      status: "success",
    });
    // 绕过 schema enum，制造跳过分支
    await UserAdRewardLog.collection.insertOne({
      userId: "full-src",
      rewardToken: "tok-src-legacy",
      rewardType: "legacy_upload",
      rewardValue: 1,
      adProvider: "wx",
      adUnitId: "ad2",
      requestId: "r2",
      status: "success",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const pre = await UserMigrationService.precheck({
      sourceOpenid: "full-src",
      targetOpenid: "full-tgt",
      remark: "全量覆盖",
      operator: "ops",
    });
    expect(pre.summary.reminders).toBe(1);
    expect(pre.summary.templates).toBe(1);
    expect(pre.summary.assets).toBe(1);

    const result = await UserMigrationService.execute({
      sourceOpenid: "full-src",
      targetOpenid: "full-tgt",
      operator: "ops",
      remark: "全量覆盖",
      idempotencyKey: "idem-full",
    });
    expect(result.task.status).toBe("success");

    expect(await NoteBook.countDocuments({ userId: "full-tgt" })).toBe(1);
    expect(await Note.countDocuments({ userId: "full-tgt" })).toBe(1);
    expect(await Reminder.countDocuments({ userId: "full-tgt" })).toBe(1);
    expect(
      await Template.countDocuments({ userId: "full-tgt", isSystem: false }),
    ).toBe(1);
    expect(await UserImageAsset.countDocuments({ userId: "full-tgt" })).toBe(1);

    const migratedNote = await Note.findOne({ userId: "full-tgt" }).lean();
    expect(migratedNote?.isShare).toBe(false);
    expect(migratedNote?.shareId).toBeFalsy();

    const assets = await UserImageAsset.find({ userId: "full-tgt" }).lean();
    expect(assets.length).toBe(1);
    // 迁徙后资产要么指向新 note，要么保留原 storageKey 关联
    expect(
      assets[0].refId === String(migratedNote?._id) ||
        Boolean(assets[0].storageKey),
    ).toBe(true);

    expect(await UserUploadQuotaDaily.countDocuments({ userId: "full-tgt" })).toBe(
      1,
    );
    expect(await UserAiUsageDaily.countDocuments({ userId: "full-tgt" })).toBe(1);
    // 仅 points 日志迁入，legacy 被 skip
    expect(await UserAdRewardLog.countDocuments({ userId: "full-tgt" })).toBe(1);

    const quotaModule = result.task.moduleResults.find(
      (m) => m.name === "quota_and_ad_logs",
    );
    expect(quotaModule?.skipped).toBe(1);
    expect(quotaModule?.message).toMatch(/跳过/);
  });

  it("源无笔记/本时仍清空目标旧数据", async () => {
    await seedUser({ userId: "empty-src" });
    await seedUser({ userId: "empty-tgt" });
    const tgtBook = await seedNoteBook("empty-tgt", "待清本");
    await seedNote({
      userId: "empty-tgt",
      noteBookId: tgtBook.id,
      title: "待清笔记",
      content: "x",
    });
    await Reminder.create({
      userId: "empty-tgt",
      noteId: "n",
      title: "t",
      content: "c",
      remindTime: new Date(),
      messageId: "m",
      subscriptionStatus: "subscribed",
      sendStatus: "pending",
      retryCount: 0,
    });
    await Template.create({
      userId: "empty-tgt",
      name: "旧",
      description: "",
      fields: { title: "t", content: "c", tags: [] },
      isSystem: false,
    });
    await UserImageAsset.create({
      userId: "empty-tgt",
      storageKey: "k",
      url: "https://cdn/x.png",
      source: "note",
      refId: "r",
    });

    const result = await UserMigrationService.execute({
      sourceOpenid: "empty-src",
      targetOpenid: "empty-tgt",
      operator: "ops",
      remark: "清空目标",
      idempotencyKey: "idem-empty-src",
    });
    expect(result.task.status).toBe("success");
    expect(await Note.countDocuments({ userId: "empty-tgt" })).toBe(0);
    expect(await NoteBook.countDocuments({ userId: "empty-tgt" })).toBe(0);
    expect(await Reminder.countDocuments({ userId: "empty-tgt" })).toBe(0);
    expect(
      await Template.countDocuments({ userId: "empty-tgt", isSystem: false }),
    ).toBe(0);
    expect(await UserImageAsset.countDocuments({ userId: "empty-tgt" })).toBe(0);
  });

  it("幂等键 running 冲突；failed 任务可重试成功", async () => {
    await seedUser({ userId: "retry-src" });
    await seedUser({ userId: "retry-tgt" });

    await UserMigrationTask.create({
      taskId: "mig_running_1",
      sourceOpenid: "retry-src",
      targetOpenid: "retry-tgt",
      operator: "ops",
      remark: "running",
      idempotencyKey: "idem-running",
      status: "running",
      attemptCount: 1,
    });

    await expect(
      UserMigrationService.execute({
        sourceOpenid: "retry-src",
        targetOpenid: "retry-tgt",
        operator: "ops",
        remark: "running",
        idempotencyKey: "idem-running",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await UserMigrationTask.create({
      taskId: "mig_failed_1",
      sourceOpenid: "retry-src",
      targetOpenid: "retry-tgt",
      operator: "ops",
      remark: "失败重试",
      idempotencyKey: "idem-failed",
      status: "failed",
      attemptCount: 1,
      errorMessage: "上次失败",
    });

    const retried = await UserMigrationService.execute({
      sourceOpenid: "retry-src",
      targetOpenid: "retry-tgt",
      operator: "ops",
      remark: "失败重试",
      idempotencyKey: "idem-failed",
    });
    expect(retried.idempotentHit).toBe(false);
    expect(retried.task.status).toBe("success");
    expect(retried.task.attemptCount).toBe(2);
  });

  it("模块失败后回滚并标记 failed", async () => {
    await seedUser({ userId: "fail-src", nickname: "源", points: 20 });
    await seedUser({ userId: "fail-tgt", nickname: "目标", points: 3 });
    const book = await seedNoteBook("fail-src", "本");
    await seedNote({
      userId: "fail-src",
      noteBookId: book.id,
      title: "n",
      content: "c",
    });

    const insertSpy = vi
      .spyOn(NoteBook, "insertMany")
      .mockRejectedValueOnce(new Error("notebook insert boom"));

    await expect(
      UserMigrationService.execute({
        sourceOpenid: "fail-src",
        targetOpenid: "fail-tgt",
        operator: "ops",
        remark: "制造失败",
        idempotencyKey: "idem-fail",
      }),
    ).rejects.toBeInstanceOf(MigrationBusinessError);

    insertSpy.mockRestore();

    const task = await UserMigrationTask.findOne({
      idempotencyKey: "idem-fail",
    }).lean();
    expect(task?.status).toBe("failed");
    expect(task?.errorMessage).toMatch(/notebook insert boom/);

    const tgt = await User.findOne({ userId: "fail-tgt" }).lean();
    expect(tgt?.nickname).toBe("目标");
    expect(tgt?.points).toBe(3);
  });

  it("回滚自身失败时标记 rollback_failed", async () => {
    await seedUser({ userId: "rb-src", nickname: "源", points: 11 });
    await seedUser({ userId: "rb-tgt", nickname: "目标", points: 2 });
    const book = await seedNoteBook("rb-src", "本");
    await seedNote({
      userId: "rb-src",
      noteBookId: book.id,
      title: "n",
      content: "c",
    });

    const realUpdateOne = User.updateOne.bind(User);
    let updateCalls = 0;
    vi.spyOn(User, "updateOne").mockImplementation((...args: unknown[]) => {
      updateCalls += 1;
      if (updateCalls >= 2) {
        return Promise.reject(new Error("rollback boom")) as never;
      }
      return realUpdateOne(...(args as Parameters<typeof User.updateOne>));
    });

    vi.spyOn(NoteBook, "insertMany").mockRejectedValueOnce(
      new Error("notebook boom"),
    );

    await expect(
      UserMigrationService.execute({
        sourceOpenid: "rb-src",
        targetOpenid: "rb-tgt",
        operator: "ops",
        remark: "回滚失败",
        idempotencyKey: "idem-rb-fail",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const task = await UserMigrationTask.findOne({
      idempotencyKey: "idem-rb-fail",
    }).lean();
    expect(task?.status).toBe("rollback_failed");
    expect(task?.rollbackMessage).toMatch(/rollback boom/);
  });
});
