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
import NoteBook from "../../../src/model/NoteBook";
import MediaRef from "../../../src/model/MediaRef";
import PendingCosDelete from "../../../src/model/PendingCosDelete";
import { TrashPurgeService } from "../../../src/service/trashPurge.service";
import { NoteTrashService } from "../../../src/service/note/noteTrash.service";

describe("unit: TrashPurgeService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    process.env.COS_UPLOAD_DIR = "journal";
  });

  it("过期 note 硬删；未过期保留", async () => {
    const { userId } = await createAuthUser({ userId: "purge-user-1" });
    const book = await seedNoteBook(userId);
    const expiredAt = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const expired = await seedNote({
      userId,
      noteBookId: book.id,
      title: "expired",
      isDeleted: true,
      deletedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      deleteExpireAt: expiredAt,
    });
    const keep = await seedNote({
      userId,
      noteBookId: book.id,
      title: "keep",
      isDeleted: true,
      deletedAt: new Date(),
      deleteExpireAt: future,
    });

    const result = await TrashPurgeService.purgeExpiredTrashNotes(50);
    expect(result.purged).toBe(1);

    expect(await Note.findById(expired.id)).toBeNull();
    expect(await Note.findById(keep.id)).not.toBeNull();
  });

  it("同 cosKey 仍被另一未删 note 引用 → 不入队 COS", async () => {
    const { userId } = await createAuthUser({ userId: "purge-user-2" });
    const book = await seedNoteBook(userId);
    const cosKey = `journal/${userId}/202601/shared.png`;
    const expireAt = new Date(Date.now() - 1000);

    const doomed = await seedNote({
      userId,
      noteBookId: book.id,
      title: "doomed",
      isDeleted: true,
      deletedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      deleteExpireAt: expireAt,
    });
    await Note.updateOne(
      { _id: doomed.id },
      {
        $set: {
          images: [{ key: cosKey, url: `https://cdn.example/${cosKey}` }],
        },
      },
    );

    const alive = await seedNote({
      userId,
      noteBookId: book.id,
      title: "alive",
    });
    await Note.updateOne(
      { _id: alive.id },
      {
        $set: {
          images: [{ key: cosKey, url: `https://cdn.example/${cosKey}` }],
        },
      },
    );

    await MediaRef.create([
      {
        userId,
        cosKey,
        holderType: "note",
        holderId: doomed.id,
        url: `https://cdn.example/${cosKey}`,
      },
      {
        userId,
        cosKey,
        holderType: "note",
        holderId: alive.id,
        url: `https://cdn.example/${cosKey}`,
      },
    ]);

    await TrashPurgeService.purgeExpiredTrashNotes(50);

    expect(await Note.findById(doomed.id)).toBeNull();
    const pending = await PendingCosDelete.findOne({ cosKey }).lean();
    expect(pending).toBeNull();
    expect(await MediaRef.countDocuments({ userId, cosKey })).toBe(1);
  });

  it("同 cosKey 仍被 cover holder 引用 → 不入队", async () => {
    const { userId } = await createAuthUser({ userId: "purge-user-3" });
    const book = await seedNoteBook(userId);
    const cosKey = `journal/${userId}/202601/cover-shared.png`;
    const expireAt = new Date(Date.now() - 1000);

    const doomed = await seedNote({
      userId,
      noteBookId: book.id,
      title: "doomed-cover",
      isDeleted: true,
      deletedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      deleteExpireAt: expireAt,
    });
    await Note.updateOne(
      { _id: doomed.id },
      {
        $set: {
          images: [{ key: cosKey, url: `https://cdn.example/${cosKey}` }],
        },
      },
    );
    await MediaRef.create([
      {
        userId,
        cosKey,
        holderType: "note",
        holderId: doomed.id,
        url: `https://cdn.example/${cosKey}`,
      },
      {
        userId,
        cosKey,
        holderType: "cover",
        holderId: "cover-slot-1",
        url: `https://cdn.example/${cosKey}`,
      },
    ]);

    await TrashPurgeService.purgeExpiredTrashNotes(50);
    expect(await PendingCosDelete.findOne({ cosKey })).toBeNull();
  });

  it("脏 cover: key + 合法 url：purge 成功且队列仅真实 object key", async () => {
    const { userId } = await createAuthUser({ userId: "purge-user-4" });
    const book = await seedNoteBook(userId);
    const cosKey = `journal/${userId}/202601/from-cover.png`;
    const expireAt = new Date(Date.now() - 1000);
    const publicDomain = "https://cdn.example.com";
    process.env.COS_PUBLIC_DOMAIN = publicDomain;

    const doomed = await seedNote({
      userId,
      noteBookId: book.id,
      title: "dirty-cover-key",
      isDeleted: true,
      deletedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      deleteExpireAt: expireAt,
    });
    await Note.updateOne(
      { _id: doomed.id },
      {
        $set: {
          images: [
            {
              key: "cover:abc123",
              url: `${publicDomain}/${cosKey}`,
            },
          ],
        },
      },
    );

    await TrashPurgeService.purgeExpiredTrashNotes(50);
    expect(await Note.findById(doomed.id)).toBeNull();

    const coverPseudo = await PendingCosDelete.findOne({
      cosKey: "cover:abc123",
    }).lean();
    expect(coverPseudo).toBeNull();

    const real = await PendingCosDelete.findOne({ cosKey }).lean();
    expect(real).not.toBeNull();
    expect(real?.status).toBe("pending");
  });

  it("过期 notebook：本删除；已恢复到其它本的文不受影响", async () => {
    const { userId } = await createAuthUser({ userId: "purge-user-5" });
    const expiredBook = await seedNoteBook(userId, "expired-book", {
      isDeleted: true,
    });
    await NoteBook.updateOne(
      { _id: expiredBook.id },
      { $set: { deleteExpireAt: new Date(Date.now() - 1000) } },
    );

    const aliveBook = await seedNoteBook(userId, "alive-book");
    const restored = await seedNote({
      userId,
      noteBookId: aliveBook.id,
      title: "restored-elsewhere",
    });

    const softInExpired = await seedNote({
      userId,
      noteBookId: expiredBook.id,
      title: "soft-in-book",
      isDeleted: true,
      deletedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      deleteExpireAt: new Date(Date.now() - 1000),
    });

    await TrashPurgeService.runWeeklyPurge({
      noteLimit: 50,
      notebookLimit: 50,
    });

    expect(await NoteBook.findById(expiredBook.id)).toBeNull();
    expect(await Note.findById(softInExpired.id)).toBeNull();
    expect(await Note.findById(restored.id)).not.toBeNull();
    expect(await NoteBook.findById(aliveBook.id)).not.toBeNull();
  });

  it("batch 中第 N 条抛错时前后仍继续", async () => {
    const { userId } = await createAuthUser({ userId: "purge-user-6" });
    const book = await seedNoteBook(userId);
    const expireAt = new Date(Date.now() - 1000);

    const a = await seedNote({
      userId,
      noteBookId: book.id,
      title: "a",
      isDeleted: true,
      deletedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      deleteExpireAt: expireAt,
    });
    const b = await seedNote({
      userId,
      noteBookId: book.id,
      title: "b",
      isDeleted: true,
      deletedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      deleteExpireAt: expireAt,
    });
    const c = await seedNote({
      userId,
      noteBookId: book.id,
      title: "c",
      isDeleted: true,
      deletedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      deleteExpireAt: expireAt,
    });

    const original = NoteTrashService.purgeNote.bind(NoteTrashService);
    const spy = vi
      .spyOn(NoteTrashService, "purgeNote")
      .mockImplementation(async (id, uid) => {
        if (id === b.id) throw new Error("mock mid failure");
        return original(id, uid);
      });

    const result = await TrashPurgeService.purgeExpiredTrashNotes(50);
    expect(result.errors).toBe(1);
    expect(result.purged).toBe(2);
    expect(await Note.findById(a.id)).toBeNull();
    expect(await Note.findById(b.id)).not.toBeNull();
    expect(await Note.findById(c.id)).toBeNull();

    spy.mockRestore();
  });
});
