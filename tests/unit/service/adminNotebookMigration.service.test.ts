import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import Note from "../../../src/model/Note";
import NoteBook from "../../../src/model/NoteBook";
import {
  AdminNotebookMigrationService,
  NOTEBOOK_MIGRATION_TYPE,
  NOTEBOOK_MIGRATION_VERSION,
  type NotebookMigrationEnvelope,
} from "../../../src/service/adminNotebookMigration.service";
import { MediaReferenceService } from "../../../src/service/mediaReference.service";
import { recordFromNoteImages } from "../../../src/service/userImageAsset.service";
import { MAX_PINNED_PER_NOTEBOOK } from "../../../src/service/note/note.shared";

vi.mock("../../../src/service/mediaReference.service", () => ({
  MediaReferenceService: {
    syncNoteImages: vi.fn().mockResolvedValue(undefined),
    releaseNoteRefs: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../src/service/userImageAsset.service", () => ({
  recordFromNoteImages: vi.fn(),
}));

const validImage = {
  url: "https://cdn.example.com/a.jpg",
  key: "journal/u/a.jpg",
  thumbUrl: "https://cdn.example.com/a-t.jpg",
  thumbKey: "journal/u/a-t.jpg",
  width: 100,
  height: 80,
  size: 2048,
  mimeType: "image/jpeg" as const,
  createdAt: "2024-01-15T08:00:00.000Z",
};

function baseEnvelope(
  overrides: Partial<NotebookMigrationEnvelope> & {
    notebook?: Partial<NotebookMigrationEnvelope["notebook"]>;
    notes?: NotebookMigrationEnvelope["notes"];
  } = {},
): NotebookMigrationEnvelope {
  const { notebook, notes, ...rest } = overrides;
  return {
    version: NOTEBOOK_MIGRATION_VERSION,
    type: NOTEBOOK_MIGRATION_TYPE,
    exportTime: "2024-06-01T00:00:00.000Z",
    appName: "手帐",
    notebook: {
      title: "迁移本",
      coverImg: "https://cdn.example.com/cover.png",
      ...notebook,
    },
    notes: notes ?? [
      {
        title: "第一条",
        content: "正文",
        tags: ["日常"],
        images: [],
        isFavorite: false,
        favoritedAt: null,
        isPinned: false,
        pinnedAt: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      },
    ],
    statistics: { noteCount: (notes ?? [{}]).length },
    ...rest,
  };
}

describe("unit: AdminNotebookMigrationService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(MediaReferenceService.syncNoteImages).mockReset();
    vi.mocked(MediaReferenceService.syncNoteImages).mockResolvedValue(undefined as never);
    vi.mocked(MediaReferenceService.releaseNoteRefs).mockReset();
    vi.mocked(MediaReferenceService.releaseNoteRefs).mockResolvedValue(undefined as never);
    vi.mocked(recordFromNoteImages).mockReset();
  });

  describe("exportNotebook", () => {
    it("成功导出含图片、标签、收藏与置顶的手帐", async () => {
      const { userId } = await seedUser({ userId: "export-u1" });
      const book = await seedNoteBook(userId, "我的本/A:特?");
      await NoteBook.updateOne(
        { _id: book.id },
        { $set: { coverImg: "https://cdn.example.com/c.png" } },
      );

      const favoritedAt = new Date("2024-03-01T10:00:00.000Z");
      const pinnedAt = new Date("2024-03-02T10:00:00.000Z");
      const imgCreatedAt = new Date("2024-02-01T12:00:00.000Z");

      await Note.create({
        userId,
        noteBookId: book.id,
        title: "带图笔记",
        content: "有图有标签",
        tags: ["旅行", "美食"],
        images: [
          {
            url: "https://cdn.example.com/n1.jpg",
            key: "journal/u/n1.jpg",
            thumbUrl: "https://cdn.example.com/n1-t.jpg",
            thumbKey: "journal/u/n1-t.jpg",
            width: 200,
            height: 150,
            size: 4096,
            mimeType: "image/jpeg",
            createdAt: imgCreatedAt,
          },
          {
            url: "https://cdn.example.com/n2.png",
            key: "journal/u/n2.png",
            width: 50,
            height: 50,
            size: 100,
            mimeType: "image/png",
          },
        ],
        isFavorite: true,
        favoritedAt,
        isPinned: true,
        pinnedAt,
        isShare: false,
        shareVersion: 0,
        isDeleted: false,
      });

      await seedNote({
        userId,
        noteBookId: book.id,
        title: "普通笔记",
        content: "无图",
        tags: ["随笔"],
      });

      const { envelope, fileName } = await AdminNotebookMigrationService.exportNotebook(
        book.id,
      );

      expect(envelope.version).toBe(NOTEBOOK_MIGRATION_VERSION);
      expect(envelope.type).toBe(NOTEBOOK_MIGRATION_TYPE);
      expect(envelope.appName).toBe("手帐");
      expect(envelope.notebook).toEqual({
        title: "我的本/A:特?",
        coverImg: "https://cdn.example.com/c.png",
      });
      expect(envelope.statistics.noteCount).toBe(2);
      expect(envelope.notes).toHaveLength(2);

      const withImages = envelope.notes.find((n) => n.title === "带图笔记");
      expect(withImages).toMatchObject({
        content: "有图有标签",
        tags: ["旅行", "美食"],
        isFavorite: true,
        favoritedAt: favoritedAt.toISOString(),
        isPinned: true,
        pinnedAt: pinnedAt.toISOString(),
      });
      expect(withImages?.images).toHaveLength(2);
      expect(withImages?.images[0]).toMatchObject({
        url: "https://cdn.example.com/n1.jpg",
        key: "journal/u/n1.jpg",
        thumbUrl: "https://cdn.example.com/n1-t.jpg",
        thumbKey: "journal/u/n1-t.jpg",
        width: 200,
        height: 150,
        size: 4096,
        mimeType: "image/jpeg",
        createdAt: imgCreatedAt.toISOString(),
      });
      expect(withImages?.images[1]).toMatchObject({
        url: "https://cdn.example.com/n2.png",
        key: "journal/u/n2.png",
        mimeType: "image/png",
      });
      expect(withImages?.images[1].thumbUrl).toBeUndefined();

      expect(fileName.startsWith("手帐本_我的本_A_特__")).toBe(true);
      expect(fileName.endsWith(".json")).toBe(true);
    });

    it("空笔记本成功导出、排除已删除笔记", async () => {
      const { userId } = await seedUser({ userId: "export-empty" });
      const book = await seedNoteBook(userId, "空本");
      await seedNote({
        userId,
        noteBookId: book.id,
        title: "回收站",
        isDeleted: true,
      });

      const { envelope, fileName } = await AdminNotebookMigrationService.exportNotebook(
        book.id,
      );

      expect(envelope.notes).toEqual([]);
      expect(envelope.statistics.noteCount).toBe(0);
      expect(envelope.notebook.coverImg).toBe("");
      expect(fileName).toContain("手帐本_空本_");
    });

    it("手帐本不存在时抛错", async () => {
      await expect(
        AdminNotebookMigrationService.exportNotebook("000000000000000000000000"),
      ).rejects.toThrow("手帐本不存在");
    });

    it("已删除手帐本无法导出", async () => {
      const { userId } = await seedUser({ userId: "export-del" });
      const book = await seedNoteBook(userId, "已删本", { isDeleted: true });

      await expect(
        AdminNotebookMigrationService.exportNotebook(book.id),
      ).rejects.toThrow("手帐本已删除，无法导出");
    });
  });

  describe("importNotebook", () => {
    it("成功导入到目标用户，写入笔记并同步媒体", async () => {
      const { userId } = await seedUser({ userId: "import-tgt" });
      const payload = baseEnvelope({
        notes: [
          {
            title: "图文笔记",
            content: "导入内容",
            tags: ["a", "a", "  ", "123456789012345678901", "b"],
            images: [validImage],
            isFavorite: true,
            favoritedAt: "2024-04-01T00:00:00.000Z",
            isPinned: true,
            pinnedAt: "2024-04-02T00:00:00.000Z",
            createdAt: "2024-03-01T00:00:00.000Z",
            updatedAt: "2024-03-02T00:00:00.000Z",
          },
          {
            title: "普通",
            content: "",
            tags: "not-array" as unknown as string[],
            images: [],
            isFavorite: false,
            favoritedAt: null,
            isPinned: false,
            pinnedAt: null,
            createdAt: "invalid-date",
            updatedAt: "",
          },
        ],
      });

      const result = await AdminNotebookMigrationService.importNotebook(
        userId,
        payload,
      );

      expect(result.importedNotes).toBe(2);
      expect(result.skippedNotes).toBe(0);
      expect(result.warnings).toEqual([]);
      expect(result.title).toBe("迁移本");

      const book = await NoteBook.findById(result.notebookId).lean();
      expect(book).toMatchObject({
        title: "迁移本",
        userId,
        count: 2,
        coverImg: "https://cdn.example.com/cover.png",
      });

      const notes = await Note.find({ noteBookId: result.notebookId })
        .sort({ title: 1 })
        .lean();
      expect(notes).toHaveLength(2);

      const rich = notes.find((n) => n.title === "图文笔记");
      expect(rich?.tags).toEqual(["a", "b"]);
      expect(rich?.images).toHaveLength(1);
      expect(rich?.images[0]).toMatchObject({
        url: validImage.url,
        key: validImage.key,
        mimeType: "image/jpeg",
      });
      expect(rich?.isFavorite).toBe(true);
      expect(rich?.isPinned).toBe(true);
      expect(rich?.userId).toBe(userId);

      expect(MediaReferenceService.syncNoteImages).toHaveBeenCalledTimes(2);
      expect(recordFromNoteImages).toHaveBeenCalled();
    });

    it("titleOverride 覆盖标题", async () => {
      const { userId } = await seedUser({ userId: "import-override" });
      const result = await AdminNotebookMigrationService.importNotebook(
        userId,
        baseEnvelope(),
        { titleOverride: "  运营指定名  " },
      );
      expect(result.title).toBe("运营指定名");
      const book = await NoteBook.findById(result.notebookId).lean();
      expect(book?.title).toBe("运营指定名");
    });

    it("置顶超过上限时降级并返回 warnings", async () => {
      const { userId } = await seedUser({ userId: "import-pin" });
      const pinnedCount = MAX_PINNED_PER_NOTEBOOK + 2;
      const notes = Array.from({ length: pinnedCount }, (_, i) => ({
        title: `置顶${i}`,
        content: "c",
        tags: [],
        images: [],
        isFavorite: false,
        favoritedAt: null,
        isPinned: true,
        pinnedAt: new Date(2024, 0, i + 1).toISOString(),
        createdAt: new Date(2024, 0, i + 1).toISOString(),
        updatedAt: new Date(2024, 0, i + 1).toISOString(),
      }));

      const result = await AdminNotebookMigrationService.importNotebook(
        userId,
        baseEnvelope({ notes }),
      );

      expect(result.importedNotes).toBe(pinnedCount);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/置顶手帐超过/);

      const stored = await Note.find({ noteBookId: result.notebookId }).lean();
      const stillPinned = stored.filter((n) => n.isPinned);
      expect(stillPinned).toHaveLength(MAX_PINNED_PER_NOTEBOOK);
    });

    it("userId 为空或目标用户不存在", async () => {
      await expect(
        AdminNotebookMigrationService.importNotebook("  ", baseEnvelope()),
      ).rejects.toThrow("userId 不能为空");

      await expect(
        AdminNotebookMigrationService.importNotebook("missing-user", baseEnvelope()),
      ).rejects.toThrow("目标用户不存在");
    });

    it("校验失败：错误 type / version / 空 payload", async () => {
      const { userId } = await seedUser({ userId: "import-val" });

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, null),
      ).rejects.toThrow("导入数据格式错误");

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, "x"),
      ).rejects.toThrow("导入数据格式错误");

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, {
          ...baseEnvelope(),
          type: "other",
        }),
      ).rejects.toThrow(`仅支持 type=${NOTEBOOK_MIGRATION_TYPE}`);

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, {
          ...baseEnvelope(),
          version: "0.0.1",
        }),
      ).rejects.toThrow(`仅支持 version=${NOTEBOOK_MIGRATION_VERSION}`);
    });

    it("校验失败：缺少 notebook.title / notes 非数组 / 超限数量", async () => {
      const { userId } = await seedUser({ userId: "import-shape" });

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, {
          ...baseEnvelope(),
          notebook: { title: "  ", coverImg: "" },
        }),
      ).rejects.toThrow("导入数据缺少有效的 notebook.title");

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, {
          version: NOTEBOOK_MIGRATION_VERSION,
          type: NOTEBOOK_MIGRATION_TYPE,
          notebook: { title: "ok" },
          notes: { bad: true },
        }),
      ).rejects.toThrow("导入数据 notes 必须是数组");

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, {
          ...baseEnvelope({
            notebook: { title: "a".repeat(101), coverImg: "" },
          }),
        }),
      ).rejects.toThrow("手帐本标题不能超过 100 个字符");

      await expect(
        AdminNotebookMigrationService.importNotebook(
          userId,
          baseEnvelope(),
          { titleOverride: "x".repeat(101) },
        ),
      ).rejects.toThrow("手帐本标题不能超过 100 个字符");

      const tooMany = Array.from({ length: 5001 }, (_, i) => ({
        title: `n${i}`,
        content: "",
        tags: [],
        images: [],
        isFavorite: false,
        favoritedAt: null,
        isPinned: false,
        pinnedAt: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      }));
      await expect(
        AdminNotebookMigrationService.importNotebook(
          userId,
          baseEnvelope({ notes: tooMany }),
        ),
      ).rejects.toThrow("导入手帐数量不能超过 5000");
    });

    it("校验失败：单条手帐格式 / 缺 title / title 过长 / content 过长", async () => {
      const { userId } = await seedUser({ userId: "import-note-val" });

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, {
          ...baseEnvelope(),
          notes: [null],
        }),
      ).rejects.toThrow("第 1 条手帐格式错误");

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, {
          ...baseEnvelope(),
          notes: [{ content: "no title" }],
        }),
      ).rejects.toThrow("第 1 条手帐缺少 title");

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, {
          ...baseEnvelope(),
          notes: [{ title: "t".repeat(201), content: "" }],
        }),
      ).rejects.toThrow("第 1 条手帐 title 超过 200 个字符");

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, {
          ...baseEnvelope(),
          notes: [{ title: "ok", content: "c".repeat(50_001) }],
        }),
      ).rejects.toThrow("第 1 条手帐 content 超过长度上限");
    });

    it("校验失败：图片字段不合法", async () => {
      const { userId } = await seedUser({ userId: "import-img" });

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, {
          ...baseEnvelope(),
          notes: [
            {
              title: "坏图",
              content: "",
              images: [{ url: "not-a-url", key: "" }],
            },
          ],
        }),
      ).rejects.toThrow(/第 1 条手帐图片校验失败/);
    });

    it("同步媒体失败时回滚已创建的手帐本与笔记", async () => {
      const { userId } = await seedUser({ userId: "import-rollback" });
      vi.mocked(MediaReferenceService.syncNoteImages).mockRejectedValueOnce(
        new Error("cos sync failed"),
      );

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, baseEnvelope()),
      ).rejects.toThrow("cos sync failed");

      expect(await NoteBook.countDocuments({ userId })).toBe(0);
      expect(await Note.countDocuments({ userId })).toBe(0);
      expect(MediaReferenceService.releaseNoteRefs).toHaveBeenCalled();
    });

    it("非 Error 抛出时包装为导入失败", async () => {
      const { userId } = await seedUser({ userId: "import-wrap" });
      vi.mocked(MediaReferenceService.syncNoteImages).mockRejectedValueOnce(
        "raw-fail",
      );

      await expect(
        AdminNotebookMigrationService.importNotebook(userId, baseEnvelope()),
      ).rejects.toThrow("导入失败");
    });
  });
});
