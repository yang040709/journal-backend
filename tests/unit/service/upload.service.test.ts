import STS from "qcloud-cos-sts";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  UploadService,
  UploadDailyLimitExceededError,
  ensureDailyQuotaRecord,
  getUploadDailyBaseLimit,
} from "../../../src/service/upload.service";
import UserUploadQuotaDaily from "../../../src/model/UserUploadQuotaDaily";
import UserFeedbackImageQuotaDaily from "../../../src/model/UserFeedbackImageQuotaDaily";
import User from "../../../src/model/User";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { getQuotaDateContext } from "../../../src/utils/dateKey";

vi.mock("qcloud-cos-sts", () => ({
  default: {
    getCredential: vi.fn(),
  },
}));

vi.mock("../../../src/service/quotaBaseLimits.service", () => ({
  QuotaBaseLimitsService: {
    getQuotaBaseLimits: vi.fn(async () => ({
      uploadDailyBaseLimit: 9,
      exportWeeklyFreeLimit: 1,
      aiDailyBaseLimit: 3,
    })),
  },
}));

describe("unit: UploadService", () => {
  const envKeys = [
    "COS_SECRET_ID",
    "COS_SECRET_KEY",
    "COS_BUCKET",
    "COS_REGION",
    "COS_PUBLIC_DOMAIN",
    "COS_UPLOAD_DIR",
    "COS_MAX_FILE_SIZE_MB",
    "COS_STS_DURATION_SECONDS",
  ] as const;
  const envBackup: Record<string, string | undefined> = {};

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(STS.getCredential).mockReset();
    for (const k of envKeys) {
      if (!(k in envBackup)) envBackup[k] = process.env[k];
    }
    process.env.COS_SECRET_ID = "sid";
    process.env.COS_SECRET_KEY = "skey";
    process.env.COS_BUCKET = "bucket-125000";
    process.env.COS_REGION = "ap-guangzhou";
    process.env.COS_PUBLIC_DOMAIN = "https://cdn.example.com";
    process.env.COS_UPLOAD_DIR = "journal";
    delete process.env.COS_MAX_FILE_SIZE_MB;
    delete process.env.COS_STS_DURATION_SECONDS;

    vi.mocked(STS.getCredential).mockResolvedValue({
      expiredTime: 1_700_000_000,
      credentials: {
        tmpSecretId: "tmp-id",
        tmpSecretKey: "tmp-key",
        sessionToken: "tmp-token",
      },
    } as never);
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
  });

  it("getUploadQuotaSummary / getUploadDailyBaseLimit / ensureDailyQuotaRecord", async () => {
    expect(await getUploadDailyBaseLimit()).toBe(9);
    const { userId } = await seedUser({ userId: "upload-sum" });
    await User.updateOne(
      { userId },
      { $set: { uploadExtraQuotaTotal: 2.8 } },
    );

    const summary = await UploadService.getUploadQuotaSummary(userId);
    expect(summary.baseLimit).toBe(9);
    expect(summary.extraQuotaTotal).toBe(2);
    expect(summary.todayUsedCount).toBe(0);
    expect(summary.todayTotalLimit).toBe(11);
    expect(summary.todayRemaining).toBe(11);

    const { dateKey } = getQuotaDateContext();
    await ensureDailyQuotaRecord(userId, dateKey, 9, 2);
    const doc = await UserUploadQuotaDaily.findOne({ userId, dateKey }).lean();
    expect(doc?.baseLimit).toBe(9);
    expect(doc?.extraQuota).toBe(2);

    // 用户不存在时 extra=0
    const missing = await UploadService.getUploadQuotaSummary("no-user");
    expect(missing.extraQuotaTotal).toBe(0);
  });

  it("createCosStsCredential 成功：note + withThumb + 自定义域名", async () => {
    const { userId } = await seedUser({ userId: "sts-ok" });
    const res = await UploadService.createCosStsCredential({
      userId,
      biz: "note",
      fileName: "photo.JPEG",
      fileType: "image/jpeg",
      fileSize: 1024,
      withThumb: true,
    });

    expect(res.tmpSecretId).toBe("tmp-id");
    expect(res.key).toMatch(/\.jpeg$/i);
    expect(res.thumbKey).toMatch(/-mini\.jpg$/);
    expect(res.fileUrl).toContain("https://cdn.example.com/");
    expect(res.thumbFileUrl).toContain("-mini.jpg");
    expect(res.quota.usedCount).toBe(1);
    expect(res.quota.remaining).toBe(8);

    const policy = vi.mocked(STS.getCredential).mock.calls[0][0] as {
      policy: { statement: Array<{ resource: string[] }> };
    };
    expect(policy.policy.statement[0].resource).toHaveLength(2);
  });

  it("无扩展名时按 MIME 推断；无 PUBLIC_DOMAIN 用 COS host", async () => {
    delete process.env.COS_PUBLIC_DOMAIN;
    const { userId } = await seedUser({ userId: "sts-ext" });

    const png = await UploadService.createCosStsCredential({
      userId,
      biz: "cover",
      fileName: "noext",
      fileType: "image/png",
      fileSize: 100,
    });
    expect(png.key).toMatch(/\.png$/);
    expect(png.fileUrl).toMatch(
      /https:\/\/bucket-125000\.cos\.ap-guangzhou\.myqcloud\.com\//,
    );

    const webp = await UploadService.createCosStsCredential({
      userId,
      biz: "avatar",
      fileName: "x",
      fileType: "image/webp",
      fileSize: 100,
    });
    expect(webp.key).toMatch(/\.webp$/);
  });

  it("feedback 使用独立日额度且可成功签发", async () => {
    const { userId } = await seedUser({ userId: "sts-fb" });
    const res = await UploadService.createCosStsCredential({
      userId,
      biz: "feedback",
      fileName: "fb.jpg",
      fileType: "image/jpeg",
      fileSize: 200,
    });
    expect(res.quota.totalLimit).toBe(5);
    expect(res.quota.usedCount).toBe(1);

    const { dateKey } = getQuotaDateContext();
    const noteQuota = await UserUploadQuotaDaily.findOne({ userId, dateKey }).lean();
    expect(noteQuota?.usedCount ?? 0).toBe(0);
    const fb = await UserFeedbackImageQuotaDaily.findOne({ userId, dateKey }).lean();
    expect(fb?.usedCount).toBe(1);
  });

  it("参数校验：非法 biz / 文件类型 / 超大小 / withThumb 业务限制", async () => {
    const { userId } = await seedUser({ userId: "sts-bad" });

    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "unknown" as never,
        fileName: "a.jpg",
        fileType: "image/jpeg",
        fileSize: 10,
      }),
    ).rejects.toThrow(/不支持的业务类型/);

    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "note",
        fileName: "a.gif",
        fileType: "image/gif" as never,
        fileSize: 10,
      }),
    ).rejects.toThrow(/不支持的文件类型/);

    process.env.COS_MAX_FILE_SIZE_MB = "1";
    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "note",
        fileName: "a.jpg",
        fileType: "image/jpeg",
        fileSize: 2 * 1024 * 1024,
      }),
    ).rejects.toThrow(/文件大小超过限制/);

    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "avatar",
        fileName: "a.jpg",
        fileType: "image/jpeg",
        fileSize: 10,
        withThumb: true,
      }),
    ).rejects.toThrow(/仅手帐配图或封面支持缩略图/);

    expect(STS.getCredential).not.toHaveBeenCalled();
  });

  it("日额度耗尽抛 UploadDailyLimitExceededError", async () => {
    const { userId } = await seedUser({ userId: "sts-limit" });
    const { dateKey } = getQuotaDateContext();
    await UserUploadQuotaDaily.create({
      userId,
      dateKey,
      usedCount: 9,
      baseLimit: 9,
      extraQuota: 0,
      bizBreakdown: { note: 9, cover: 0, avatar: 0 },
    });

    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "note",
        fileName: "a.jpg",
        fileType: "image/jpeg",
        fileSize: 10,
      }),
    ).rejects.toBeInstanceOf(UploadDailyLimitExceededError);
  });

  it("feedback 额度耗尽抛错", async () => {
    const { userId } = await seedUser({ userId: "sts-fb-limit" });
    const { dateKey } = getQuotaDateContext();
    await UserFeedbackImageQuotaDaily.create({
      userId,
      dateKey,
      usedCount: 5,
    });

    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "feedback",
        fileName: "a.jpg",
        fileType: "image/jpeg",
        fileSize: 10,
      }),
    ).rejects.toBeInstanceOf(UploadDailyLimitExceededError);
  });

  it("STS 失败回滚 note / feedback 额度", async () => {
    const { userId } = await seedUser({ userId: "sts-roll" });
    const { dateKey } = getQuotaDateContext();
    vi.mocked(STS.getCredential).mockRejectedValue(new Error("STS down"));

    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "note",
        fileName: "a.jpg",
        fileType: "image/jpeg",
        fileSize: 10,
      }),
    ).rejects.toThrow("STS down");

    const noteQuota = await UserUploadQuotaDaily.findOne({ userId, dateKey }).lean();
    expect(noteQuota?.usedCount ?? 0).toBe(0);

    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "feedback",
        fileName: "a.jpg",
        fileType: "image/jpeg",
        fileSize: 10,
      }),
    ).rejects.toThrow("STS down");

    const fb = await UserFeedbackImageQuotaDaily.findOne({ userId, dateKey }).lean();
    expect(fb?.usedCount ?? 0).toBe(0);
  });

  it("STS 返回无 credentials 时回滚并抛错；缺少环境变量同样回滚", async () => {
    const { userId } = await seedUser({ userId: "sts-cred" });
    const { dateKey } = getQuotaDateContext();

    vi.mocked(STS.getCredential).mockResolvedValueOnce({} as never);
    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "cover",
        fileName: "a.jpg",
        fileType: "image/jpeg",
        fileSize: 10,
      }),
    ).rejects.toThrow(/获取COS临时凭证失败/);

    expect(
      (await UserUploadQuotaDaily.findOne({ userId, dateKey }).lean())?.usedCount ??
        0,
    ).toBe(0);

    delete process.env.COS_SECRET_KEY;
    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "note",
        fileName: "a.jpg",
        fileType: "image/jpeg",
        fileSize: 10,
      }),
    ).rejects.toThrow(/环境变量缺失/);
  });

  it("COS_MAX_FILE_SIZE_MB 非法时回退默认 2MB；duration 非法回退", async () => {
    process.env.COS_MAX_FILE_SIZE_MB = "not-a-number";
    process.env.COS_STS_DURATION_SECONDS = "abc";
    const { userId } = await seedUser({ userId: "sts-num" });

    await expect(
      UploadService.createCosStsCredential({
        userId,
        biz: "note",
        fileName: "a.jpg",
        fileType: "image/jpeg",
        fileSize: 3 * 1024 * 1024,
      }),
    ).rejects.toThrow(/文件大小超过限制/);

    const ok = await UploadService.createCosStsCredential({
      userId,
      biz: "note",
      fileName: "a.jpg",
      fileType: "image/jpeg",
      fileSize: 100,
    });
    expect(ok.tmpSecretId).toBe("tmp-id");
    const arg = vi.mocked(STS.getCredential).mock.calls.at(-1)?.[0] as {
      durationSeconds: number;
    };
    expect(arg.durationSeconds).toBe(1800);
  });
});
