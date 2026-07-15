import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import UserImageAsset from "../../../src/model/UserImageAsset";
import Note from "../../../src/model/Note";
import {
  deleteIndexByStorageKey,
  deleteIndexByUser,
  findAssetByIdForUser,
  listAll,
  listByUser,
  recordFromCover,
  recordFromNoteImages,
} from "../../../src/service/userImageAsset.service";

describe("unit: userImageAsset.service", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("recordFromNoteImages / recordFromCover 空值与成功", async () => {
    const { userId } = await seedUser({ userId: "img-u1" });
    recordFromNoteImages(userId, "note1", undefined);
    recordFromNoteImages(userId, "note1", []);
    recordFromNoteImages(userId, "note1", [
      { key: "", url: "https://x/a.png" } as never,
      {
        key: "journal/u/a.png",
        url: "https://cdn/a.png",
        thumbUrl: "https://cdn/a-m.png",
        thumbKey: "journal/u/a-m.png",
        width: 10,
        height: 8,
        size: 100,
        mimeType: "image/png",
      } as never,
    ]);
    await new Promise((r) => setTimeout(r, 50));
    expect(await UserImageAsset.countDocuments({ userId, source: "note" })).toBe(1);

    recordFromCover(userId, "", { coverUrl: "https://cdn/c.png" });
    recordFromCover(userId, "c1", { coverUrl: "" });
    recordFromCover(userId, "c1", {
      coverUrl: "https://cdn/c.png",
      thumbUrl: "https://cdn/c-m.png",
      thumbKey: "journal/u/c-m.png",
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(await UserImageAsset.countDocuments({ userId, source: "cover" })).toBe(1);
  });

  it("list/find/delete 分支", async () => {
    const { userId } = await seedUser({ userId: "img-u2" });
    await UserImageAsset.create([
      {
        userId,
        storageKey: "journal/u/1.png",
        url: "https://cdn/1.png",
        source: "note",
        refId: "n1",
      },
      {
        userId,
        storageKey: "cover:abc",
        url: "https://cdn/c.png",
        source: "cover",
        refId: "abc",
      },
      {
        userId: "other",
        storageKey: "journal/other/1.png",
        url: "https://cdn/o.png",
        source: "note",
        refId: "o1",
      },
    ]);

    const byUser = await listByUser(userId, { page: 1, limit: 10, source: "note" });
    expect(byUser.total).toBe(1);
    expect(byUser.items[0].storageKey).toBe("journal/u/1.png");

    const all = await listAll({ page: 1, limit: 10, source: "cover", userId });
    expect(all.total).toBe(1);

    const allPage = await listAll({ page: 0, limit: 999 });
    expect(allPage.items.length).toBeGreaterThanOrEqual(1);
    expect(allPage.total).toBeGreaterThanOrEqual(1);

    const noteDoc = await UserImageAsset.findOne({ storageKey: "journal/u/1.png" });
    expect(await findAssetByIdForUser(userId, String(noteDoc!._id))).toBeTruthy();
    expect(await findAssetByIdForUser(userId, "not-valid")).toBeNull();
    expect(
      await findAssetByIdForUser(userId, new mongoose.Types.ObjectId().toString()),
    ).toBeNull();
    expect(await findAssetByIdForUser("other", String(noteDoc!._id))).toBeNull();

    expect(await deleteIndexByUser(userId, "not-oid")).toBe(false);
    expect(await deleteIndexByUser(userId, String(noteDoc!._id))).toBe(true);
    expect(await deleteIndexByStorageKey(userId, "cover:abc")).toBe(true);
    expect(await deleteIndexByStorageKey(userId, "cover:abc")).toBe(false);
    expect(await deleteIndexByStorageKey(userId, "")).toBe(false);
  });

  it("listByUser 对软删手帐标记 sourceUnavailable", async () => {
    const { userId } = await seedUser({ userId: "img-src-unavail" });

    const book = await seedNoteBook(userId);
    const live = await seedNote({ userId, noteBookId: book.id, title: "live" });
    const dead = await seedNote({ userId, noteBookId: book.id, title: "dead" });
    await Note.updateOne({ _id: dead.id }, { $set: { isDeleted: true } });

    await UserImageAsset.create([
      {
        userId,
        storageKey: "journal/u/live.png",
        url: "https://cdn/live.png",
        source: "note",
        refId: live.id,
      },
      {
        userId,
        storageKey: "journal/u/dead.png",
        url: "https://cdn/dead.png",
        source: "note",
        refId: dead.id,
      },
      {
        userId,
        storageKey: "journal/u/gone.png",
        url: "https://cdn/gone.png",
        source: "note",
        refId: new mongoose.Types.ObjectId().toString(),
      },
    ]);

    const listed = await listByUser(userId, { page: 1, limit: 10, source: "note" });
    const byKey = Object.fromEntries(
      listed.items.map((it) => [it.storageKey, it.sourceUnavailable]),
    );
    expect(byKey["journal/u/live.png"]).toBe(false);
    expect(byKey["journal/u/dead.png"]).toBe(true);
    expect(byKey["journal/u/gone.png"]).toBe(true);
  });
});
