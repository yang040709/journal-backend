import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";

const getCredential = vi.fn();

vi.mock("qcloud-cos-sts", () => ({
  default: {
    getCredential: (...args: unknown[]) => getCredential(...args),
  },
}));

import { AdminGalleryService } from "../../../src/service/adminGallery.service";
import AdminGalleryImage from "../../../src/model/AdminGalleryImage";

describe("unit: AdminGalleryService", () => {
  const envKeys = [
    "COS_SECRET_ID",
    "COS_SECRET_KEY",
    "COS_BUCKET",
    "COS_REGION",
    "COS_PUBLIC_DOMAIN",
    "ADMIN_GALLERY_MAX_FILE_SIZE_MB",
    "COS_STS_DURATION_SECONDS",
    "COS_UPLOAD_DIR",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    getCredential.mockReset();
    for (const k of envKeys) {
      if (!(k in prev)) prev[k] = process.env[k];
    }
    process.env.COS_SECRET_ID = "sid";
    process.env.COS_SECRET_KEY = "skey";
    process.env.COS_BUCKET = "bucket-125000";
    process.env.COS_REGION = "ap-shanghai";
    process.env.COS_PUBLIC_DOMAIN = "https://cdn.example.com";
    delete process.env.ADMIN_GALLERY_MAX_FILE_SIZE_MB;
  });

  it("createCosStsCredential 校验与成功（含 thumb）", async () => {
    await expect(
      AdminGalleryService.createCosStsCredential({
        biz: "other" as never,
        fileName: "a.png",
        fileType: "image/png",
        fileSize: 10,
      }),
    ).rejects.toThrow(/不支持/);

    await expect(
      AdminGalleryService.createCosStsCredential({
        biz: "system_cover",
        fileName: "a.gif",
        fileType: "image/gif" as never,
        fileSize: 10,
      }),
    ).rejects.toThrow(/仅支持/);

    await expect(
      AdminGalleryService.createCosStsCredential({
        biz: "system_cover",
        fileName: "a.png",
        fileType: "image/png",
        fileSize: 0,
      }),
    ).rejects.toThrow(/文件大小/);

    process.env.ADMIN_GALLERY_MAX_FILE_SIZE_MB = "1";
    await expect(
      AdminGalleryService.createCosStsCredential({
        biz: "system_cover",
        fileName: "a.png",
        fileType: "image/png",
        fileSize: 2 * 1024 * 1024,
      }),
    ).rejects.toThrow(/超过限制/);

    getCredential.mockResolvedValueOnce({
      expiredTime: 123,
      credentials: {
        tmpSecretId: "t1",
        tmpSecretKey: "t2",
        sessionToken: "tok",
      },
    });
    const ok = await AdminGalleryService.createCosStsCredential({
      biz: "system_cover",
      fileName: "photo",
      fileType: "image/jpeg",
      fileSize: 100,
      withThumb: true,
    });
    expect(ok.key).toContain("admin-gallery/system_cover/");
    expect(ok.key.endsWith(".jpg")).toBe(true);
    expect(ok.thumbKey).toBeTruthy();
    expect(ok.fileUrl.startsWith("https://cdn.example.com/")).toBe(true);
    expect(getCredential).toHaveBeenCalledOnce();

    getCredential.mockResolvedValueOnce({ credentials: null });
    await expect(
      AdminGalleryService.createCosStsCredential({
        biz: "system_cover",
        fileName: "a.webp",
        fileType: "image/webp",
        fileSize: 10,
      }),
    ).rejects.toThrow(/临时凭证/);
  });

  it("recordUploadedImage / listImages / hideImage 分支", async () => {
    await expect(
      AdminGalleryService.recordUploadedImage({
        url: "not-url",
        storageKey: "k/a.png",
        mimeType: "image/png",
        size: 1,
        width: 1,
        height: 1,
        biz: "system_cover",
        createdByAdminId: "adm",
      }),
    ).rejects.toThrow(/URL/);

    await expect(
      AdminGalleryService.recordUploadedImage({
        url: "https://cdn.example.com/a.png",
        storageKey: "  ",
        mimeType: "image/png",
        size: 1,
        width: 1,
        height: 1,
        biz: "system_cover",
        createdByAdminId: "adm",
      }),
    ).rejects.toThrow(/storageKey/);

    const doc = await AdminGalleryService.recordUploadedImage({
      url: "https://cdn.example.com/a.png",
      storageKey: "journal/a.png",
      mimeType: "image/png",
      size: 12,
      width: 10,
      height: 8,
      biz: "system_cover",
      thumbUrl: "https://cdn.example.com/a-mini.png",
      thumbKey: "journal/a-mini.png",
      createdByAdminId: "adm1",
      createdByAdminUsername: "admin",
    });
    expect(doc?.storageKey).toBe("journal/a.png");

    const listed = await AdminGalleryService.listImages({ page: 0, limit: 50 });
    expect(listed.total).toBe(1);
    expect(listed.page).toBe(1);
    expect(listed.limit).toBe(50);

    expect(await AdminGalleryService.hideImage("")).toBe(false);
    expect(await AdminGalleryService.hideImage("not-oid")).toBe(false);
    expect(await AdminGalleryService.hideImage(String(doc!._id))).toBe(true);
    expect(await AdminGalleryImage.countDocuments({ hiddenFromGallery: true })).toBe(1);
    const afterHide = await AdminGalleryService.listImages({});
    expect(afterHide.total).toBe(0);
  });
});
