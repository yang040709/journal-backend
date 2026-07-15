import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import MediaRef from "../../../src/model/MediaRef";
import Reminder from "../../../src/model/Reminder";
import ShareSecurityTask from "../../../src/model/ShareSecurityTask";
import {
  cascadeHardDeleteNoteSideEffects,
  cascadeHardDeleteNoteSideEffectsMany,
} from "../../../src/service/note/noteHardDeleteCascade.service";
import { NoteTrashService } from "../../../src/service/note/noteTrash.service";
import { AdminNoteService } from "../../../src/service/adminNote.service";
import Note from "../../../src/model/Note";

async function seedSideEffects(userId: string, noteId: string) {
  await MediaRef.create({
    userId,
    cosKey: `journal/${userId}/cascade-${noteId}.png`,
    holderType: "note",
    holderId: noteId,
  });
  await Reminder.create({
    userId,
    noteId,
    title: "提醒",
    content: "内容",
    remindTime: new Date(Date.now() + 3600_000),
    messageId: "tpl-1",
    subscriptionStatus: "subscribed",
    sendStatus: "pending",
    retryCount: 0,
  });
  await ShareSecurityTask.create({
    taskId: `task-${noteId}`,
    noteId,
    userId,
    shareVersion: 1,
    scene: "share_enable",
    source: "wechat_text",
    status: "queued",
    retryCount: 0,
    nextRetryAt: new Date(),
    snapshot: {
      title: "t",
      content: "c",
      tags: [],
      images: [],
      riskMeta: { source: "wechat_text" },
    },
  });
  await ShareSecurityTask.create({
    taskId: `task-pass-${noteId}`,
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
  });
}

describe("unit: noteHardDeleteCascade", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("cascadeHardDeleteNoteSideEffects 释放 MediaRef、删 Reminder 与全部 ShareSecurityTask", async () => {
    const { userId } = await seedUser({ userId: "cascade-u1" });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id, title: "n" });
    await seedSideEffects(userId, note.id);

    await cascadeHardDeleteNoteSideEffects(userId, note.id);

    expect(await MediaRef.countDocuments({ holderId: note.id })).toBe(0);
    expect(await Reminder.countDocuments({ noteId: note.id })).toBe(0);
    expect(await ShareSecurityTask.countDocuments({ noteId: note.id })).toBe(0);
    expect(await Note.findById(note.id)).toBeTruthy();
  });

  it("cascadeHardDeleteNoteSideEffectsMany 空列表为 no-op", async () => {
    await cascadeHardDeleteNoteSideEffectsMany("u", []);
    await cascadeHardDeleteNoteSideEffects("", "n1");
  });

  it("purgeNote 经 cascade 后删除手帐与附属", async () => {
    const { userId } = await seedUser({ userId: "cascade-purge" });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id, title: "n" });
    await seedSideEffects(userId, note.id);
    await Note.updateOne(
      { _id: note.id },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deleteExpireAt: new Date(Date.now() + 86400_000),
        },
      },
    );

    expect(await NoteTrashService.purgeNote(note.id, userId)).toBe(true);
    expect(await Note.findById(note.id)).toBeNull();
    expect(await Reminder.countDocuments({ noteId: note.id })).toBe(0);
    expect(await ShareSecurityTask.countDocuments({ noteId: note.id })).toBe(0);
  });

  it("Admin deleteNote 活体硬删经 cascade", async () => {
    const { userId } = await seedUser({ userId: "cascade-admin" });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id, title: "n" });
    await seedSideEffects(userId, note.id);

    expect(await AdminNoteService.deleteNote(note.id)).toBe(true);
    expect(await Note.findById(note.id)).toBeNull();
    expect(await Reminder.countDocuments({ noteId: note.id })).toBe(0);
    expect(await ShareSecurityTask.countDocuments({ noteId: note.id })).toBe(0);
    expect(await MediaRef.countDocuments({ holderId: note.id })).toBe(0);
  });

  it("C 端软删 cancel 未完成安检任务并保留终态", async () => {
    const { userId } = await seedUser({ userId: "cascade-soft" });
    const book = await seedNoteBook(userId);
    const note = await seedNote({ userId, noteBookId: book.id, title: "n" });
    await ShareSecurityTask.create([
      {
        taskId: `soft-q-${note.id}`,
        noteId: note.id,
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
        taskId: `soft-p-${note.id}`,
        noteId: note.id,
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

    const { NoteCrudService } = await import(
      "../../../src/service/note/noteCrud.service"
    );
    expect(await NoteCrudService.deleteNote(note.id, userId)).toBe(true);
    expect(
      await ShareSecurityTask.countDocuments({ noteId: note.id, status: "queued" }),
    ).toBe(0);
    expect(
      await ShareSecurityTask.countDocuments({ noteId: note.id, status: "pass" }),
    ).toBe(1);
  });
});
