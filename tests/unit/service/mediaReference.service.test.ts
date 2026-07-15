import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import MediaRef from "../../../src/model/MediaRef";
import Note from "../../../src/model/Note";
import { MediaReferenceService } from "../../../src/service/mediaReference.service";

vi.mock("../../../src/service/pendingCosDelete.service", () => ({
  enqueueCosDeletes: vi.fn(async (keys: string[]) => keys.length),
}));

vi.mock("../../../src/utils/cosKeyOwnership", () => ({
  isOwnedCosKey: vi.fn((_userId: string, key: string) => key.includes("/")),
}));

describe("unit: MediaReferenceService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("resolveCosKeyFromAsset / countRefs / syncNoteImages", async () => {
    expect(
      MediaReferenceService.resolveCosKeyFromAsset({
        storageKey: "journal/u/a.png",
      }),
    ).toBe("journal/u/a.png");
    expect(
      MediaReferenceService.resolveCosKeyFromAsset({
        storageKey: "cover:1",
        url: "",
      }),
    ).toBeNull();

    const { userId } = await seedUser({ userId: "media-u1" });
    const book = await seedNoteBook(userId, "本");
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "n",
      content: "c",
    });

    expect(await MediaReferenceService.countRefs(userId, "journal/u/x.png")).toBe(0);

    await MediaReferenceService.syncNoteImages(userId, note.id, undefined);
    await MediaReferenceService.syncNoteImages(userId, note.id, [
      {
        key: "journal/u/a.png",
        url: "https://cdn/a.png",
        thumbKey: "journal/u/a-m.png",
      } as never,
      { key: "bad", url: "https://cdn/b.png" } as never,
    ]);
    expect(await MediaRef.countDocuments({ userId, holderId: note.id })).toBe(1);

    await MediaReferenceService.syncNoteImages(userId, note.id, [
      {
        key: "journal/u/b.png",
        url: "https://cdn/b.png",
      } as never,
    ]);
    expect(await MediaRef.countDocuments({ userId, holderId: note.id })).toBe(1);
    expect(
      await MediaRef.countDocuments({ userId, cosKey: "journal/u/b.png" }),
    ).toBe(1);
  });

  it("referenceCover / releaseNoteRefs / unreference note path", async () => {
    process.env.COS_PUBLIC_DOMAIN = "https://cdn.example.com";
    const { userId } = await seedUser({ userId: "media-u2" });
    const book = await seedNoteBook(userId, "本");
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "n",
      content: "c",
      images: [
        {
          key: "journal/u/n1.png",
          url: "https://cdn.example.com/journal/u/n1.png",
          thumbKey: "journal/u/n1-m.png",
        },
      ],
    });

    await MediaReferenceService.referenceCover(userId, "", { coverUrl: "https://x" });
    await MediaReferenceService.referenceCover(userId, "c1", { coverUrl: "" });
    await MediaReferenceService.referenceCover(userId, "c1", {
      coverUrl: "https://cdn.example.com/journal/u/cover.png",
      thumbKey: "journal/u/cover-m.png",
    });
    expect(
      await MediaRef.countDocuments({
        userId,
        holderType: "cover",
        holderId: "c1",
      }),
    ).toBe(1);

    await MediaRef.create({
      userId,
      cosKey: "journal/u/n1.png",
      holderType: "note",
      holderId: note.id,
      url: "https://cdn.example.com/journal/u/n1.png",
      thumbKey: "journal/u/n1-m.png",
    });

    await MediaReferenceService.releaseNoteRefs(userId, note.id);
    expect(
      await MediaRef.countDocuments({ userId, holderType: "note", holderId: note.id }),
    ).toBe(0);

    await Note.updateOne(
      { _id: note.id },
      {
        $set: {
          images: [
            {
              key: "journal/u/n2.png",
              url: "https://cdn.example.com/journal/u/n2.png",
            },
          ],
        },
      },
    );
    await MediaRef.create({
      userId,
      cosKey: "journal/u/n2.png",
      holderType: "note",
      holderId: note.id,
      url: "https://cdn.example.com/journal/u/n2.png",
    });

    await expect(
      MediaReferenceService.unreference(userId, "alone", {
        reason: "gallery",
      }),
    ).rejects.toThrow(/无效/);

    const result = await MediaReferenceService.unreference(userId, "journal/u/n2.png", {
      reason: "gallery",
      source: "note",
    });
    expect(result.cosKey).toBe("journal/u/n2.png");
    expect(result.notesUpdated).toBeGreaterThanOrEqual(0);
    const noteAfter = await Note.findById(note.id).lean();
    expect((noteAfter?.images || []).length).toBe(0);
  });

  it("releaseCoverRef / unreferenceByStorageKey", async () => {
    process.env.COS_PUBLIC_DOMAIN = "https://cdn.example.com";
    const { userId } = await seedUser({ userId: "media-u3" });
    await MediaRef.create({
      userId,
      cosKey: "journal/u/c.png",
      holderType: "cover",
      holderId: "cid",
      url: "https://cdn.example.com/journal/u/c.png",
    });
    await MediaReferenceService.releaseCoverRef(userId, "cid", {
      coverUrl: "https://cdn.example.com/journal/u/c.png",
    });
    expect(
      await MediaRef.countDocuments({ userId, holderType: "cover", holderId: "cid" }),
    ).toBe(0);

    await MediaRef.create({
      userId,
      cosKey: "journal/u/g.png",
      holderType: "note",
      holderId: "nid",
      url: "https://cdn.example.com/journal/u/g.png",
    });
    await MediaReferenceService.unreferenceByStorageKey(userId, "journal/u/g.png", {
      reason: "purge",
      source: "note",
    });
    expect(await MediaRef.countDocuments({ cosKey: "journal/u/g.png" })).toBe(0);
  });
});
