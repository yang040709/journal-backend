import { randomUUID } from "crypto";
import STS from "qcloud-cos-sts";
import UserUploadQuotaDaily, { UploadBiz } from "../model/UserUploadQuotaDaily";
import User from "../model/User";
import UserAdRewardLog from "../model/UserAdRewardLog";
import { getQuotaDateContext } from "../utils/dateKey";

export interface CreateCosStsInput {
  userId: string;
  biz: UploadBiz;
  fileName: string;
  fileType: "image/jpeg" | "image/png" | "image/webp";
  fileSize: number;
  /** biz=note 或 cover：签发主图 + 缩略图两个 key，额度仍只扣 1 次 */
  withThumb?: boolean;
}

export interface CosStsResponse {
  bucket: string;
  region: string;
  key: string;
  /** withThumb 时返回，缩略图为 JPEG，键名 `{uuid}-mini.jpg` */
  thumbKey?: string;
  expiredTime: number;
  tmpSecretId: string;
  tmpSecretKey: string;
  sessionToken: string;
  uploadHost: string;
  fileUrl: string;
  thumbFileUrl?: string;
  quota: {
    dateKey: string;
    totalLimit: number;
    usedCount: number;
    remaining: number;
  };
}

export interface UploadQuotaSummary {
  dateKey: string;
  baseLimit: number;
  extraQuotaTotal: number;
  todayUsedCount: number;
  todayTotalLimit: number;
  todayRemaining: number;
  todayAdRewardCount: number;
  todayAdRewardLimit: number;
}

export interface GrantUploadAdRewardInput {
  adProvider: string;
  adUnitId: string;
  rewardToken: string;
  requestId?: string;
}

export interface GrantUploadAdRewardResult {
  rewardQuota: number;
  extraQuotaTotal: number;
  duplicated: boolean;
}

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"] as const);
const allowedBizTypes = new Set<UploadBiz>(["note", "cover"]);

export class UploadDailyLimitExceededError extends Error {
  public readonly code = "UPLOAD_DAILY_LIMIT_EXCEEDED";
  public readonly details: {
    dateKey: string;
    totalLimit: number;
    usedCount: number;
    remaining: number;
  };

  constructor(details: { dateKey: string; totalLimit: number; usedCount: number; remaining: number }) {
    super(`今日上传额度已用完（总额度${details.totalLimit}张）`);
    this.name = "UploadDailyLimitExceededError";
    this.details = details;
  }
}

export class UploadAdRewardInvalidError extends Error {
  public readonly code = "UPLOAD_AD_REWARD_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "UploadAdRewardInvalidError";
  }
}

export class UploadAdRewardDailyLimitExceededError extends Error {
  public readonly code = "UPLOAD_AD_REWARD_DAILY_LIMIT_EXCEEDED";
  public readonly details: { todayAdRewardCount: number; todayAdRewardLimit: number };

  constructor(details: { todayAdRewardCount: number; todayAdRewardLimit: number }) {
    super(`今日观看广告次数已达上限（${details.todayAdRewardCount}/${details.todayAdRewardLimit}次），明日再来`);
    this.name = "UploadAdRewardDailyLimitExceededError";
    this.details = details;
  }
}

const toNumber = (value: string | undefined, fallbackValue: number): number => {
  if (!value) return fallbackValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
};

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`环境变量缺失: ${name}`);
  }
  return value;
};

/** 与 C 端上传日基础额度一致，供管理端列表等只读场景复用 */
export const getUploadDailyBaseLimit = (): number => {
  const parsed = Number(process.env.UPLOAD_DAILY_BASE_LIMIT ?? 15);
  if (!Number.isFinite(parsed) || parsed < 0) return 15;
  return Math.floor(parsed);
};

const getDailyBaseLimit = (): number => getUploadDailyBaseLimit();

const getAdRewardQuotaValue = (): number => {
  const parsed = Number(process.env.UPLOAD_AD_REWARD_VALUE ?? 3);
  if (!Number.isFinite(parsed) || parsed <= 0) return 3;
  return Math.floor(parsed);
};

const getDailyAdRewardLimit = (): number => {
  const parsed = Number(process.env.UPLOAD_AD_REWARD_DAILY_LIMIT ?? 6);
  if (!Number.isFinite(parsed) || parsed <= 0) return 6;
  return Math.floor(parsed);
};

const getUserExtraQuotaTotal = async (userId: string): Promise<number> => {
  const user = await User.findOne({ userId }).select("uploadExtraQuotaTotal").lean();
  if (!user) return 0;
  const value = Number((user as any).uploadExtraQuotaTotal || 0);
  return Math.max(0, Math.floor(value));
};

const getTodayAdRewardCount = async (userId: string): Promise<number> => {
  const { dateKey } = getQuotaDateContext();
  const startOfDay = new Date(`${dateKey}T00:00:00+08:00`);
  const endOfDay = new Date(`${dateKey}T23:59:59.999+08:00`);
  const count = await UserAdRewardLog.countDocuments({
    userId,
    rewardType: "upload_quota",
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });
  return Math.max(0, count);
};

const ensureDailyQuotaRecord = async (userId: string, dateKey: string, baseLimit: number, extraQuota: number) => {
  await UserUploadQuotaDaily.updateOne(
    { userId, dateKey },
    {
      $setOnInsert: {
        userId,
        dateKey,
        usedCount: 0,
        bizBreakdown: {
          note: 0,
          cover: 0,
        },
      },
      $set: {
        baseLimit,
        extraQuota,
      },
    },
    { upsert: true },
  );
};

const consumeDailyQuota = async (userId: string, biz: UploadBiz) => {
  const { dateKey } = getQuotaDateContext();
  const baseLimit = getDailyBaseLimit();
  const extraQuota = await getUserExtraQuotaTotal(userId);

  await ensureDailyQuotaRecord(userId, dateKey, baseLimit, extraQuota);

  const updated = await UserUploadQuotaDaily.findOneAndUpdate(
    {
      userId,
      dateKey,
      $expr: {
        $lt: ["$usedCount", { $add: ["$baseLimit", "$extraQuota"] }],
      },
    },
    {
      $inc: {
        usedCount: 1,
        [`bizBreakdown.${biz}`]: 1,
      },
    },
    {
      new: true,
    },
  ).lean();

  if (!updated) {
    const current = await UserUploadQuotaDaily.findOne({ userId, dateKey }).lean();
    const totalLimit = Math.max(0, Number(current?.baseLimit || 0) + Number(current?.extraQuota || 0));
    const usedCount = Math.max(0, Number(current?.usedCount || 0));
    throw new UploadDailyLimitExceededError({
      dateKey,
      totalLimit,
      usedCount,
      remaining: Math.max(0, totalLimit - usedCount),
    });
  }

  const totalLimit = Math.max(0, Number(updated.baseLimit || 0) + Number(updated.extraQuota || 0));
  const usedCount = Math.max(0, Number(updated.usedCount || 0));
  return {
    dateKey,
    totalLimit,
    usedCount,
    remaining: Math.max(0, totalLimit - usedCount),
  };
};

const getFileExt = (fileName: string, fileType: string): string => {
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex > -1 && dotIndex < normalized.length - 1) {
    return normalized.slice(dotIndex);
  }

  if (fileType === "image/jpeg") return ".jpg";
  if (fileType === "image/png") return ".png";
  if (fileType === "image/webp") return ".webp";
  return ".bin";
};

const createCosResource = (bucket: string, region: string, key: string): string => {
  const split = bucket.split("-");
  const appId = split[split.length - 1];
  return `qcs::cos:${region}:uid/${appId}:${bucket}/${key}`;
};

export class UploadService {
  static async getUploadQuotaSummary(userId: string): Promise<UploadQuotaSummary> {
    const { dateKey } = getQuotaDateContext();
    const baseLimit = getDailyBaseLimit();
    const extraQuotaTotal = await getUserExtraQuotaTotal(userId);
    const todayAdRewardLimit = getDailyAdRewardLimit();
    const todayAdRewardCount = await getTodayAdRewardCount(userId);

    await ensureDailyQuotaRecord(userId, dateKey, baseLimit, extraQuotaTotal);

    const current = await UserUploadQuotaDaily.findOne({ userId, dateKey }).lean();
    const todayUsedCount = Math.max(0, Number(current?.usedCount || 0));
    const todayTotalLimit = Math.max(0, baseLimit + extraQuotaTotal);

    return {
      dateKey,
      baseLimit,
      extraQuotaTotal,
      todayUsedCount,
      todayTotalLimit,
      todayRemaining: Math.max(0, todayTotalLimit - todayUsedCount),
      todayAdRewardCount,
      todayAdRewardLimit,
    };
  }

  static async grantUploadAdReward(
    userId: string,
    input: GrantUploadAdRewardInput,
  ): Promise<GrantUploadAdRewardResult> {
    const rewardToken = String(input.rewardToken || "").trim();
    if (!rewardToken) {
      throw new UploadAdRewardInvalidError("奖励凭证不能为空");
    }

    const existed = await UserAdRewardLog.findOne({ rewardToken }).lean();
    if (existed) {
      if (existed.userId !== userId) {
        throw new UploadAdRewardInvalidError("奖励凭证无效");
      }
      const extraQuotaTotal = await getUserExtraQuotaTotal(userId);
      return {
        rewardQuota: Number(existed.rewardValue || getAdRewardQuotaValue()),
        extraQuotaTotal,
        duplicated: true,
      };
    }

    const dailyLimit = getDailyAdRewardLimit();
    const todayCount = await getTodayAdRewardCount(userId);
    if (todayCount >= dailyLimit) {
      throw new UploadAdRewardDailyLimitExceededError({
        todayAdRewardCount: todayCount,
        todayAdRewardLimit: dailyLimit,
      });
    }

    const rewardQuota = getAdRewardQuotaValue();
    try {
      await UserAdRewardLog.create({
        userId,
        rewardToken,
        rewardType: "upload_quota",
        rewardValue: rewardQuota,
        adProvider: String(input.adProvider || "").trim(),
        adUnitId: String(input.adUnitId || "").trim(),
        requestId: String(input.requestId || "").trim(),
        status: "success",
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        const extraQuotaTotal = await getUserExtraQuotaTotal(userId);
        return {
          rewardQuota,
          extraQuotaTotal,
          duplicated: true,
        };
      }
      throw err;
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          userId,
        },
        $inc: {
          uploadExtraQuotaTotal: rewardQuota,
        },
      },
      { upsert: true, new: true },
    ).lean();

    const extraQuotaTotal = Math.max(0, Number((updatedUser as any)?.uploadExtraQuotaTotal || 0));

    const { dateKey } = getQuotaDateContext();
    const baseLimit = getDailyBaseLimit();
    await ensureDailyQuotaRecord(userId, dateKey, baseLimit, extraQuotaTotal);

    return {
      rewardQuota,
      extraQuotaTotal,
      duplicated: false,
    };
  }

  static async createCosStsCredential(input: CreateCosStsInput): Promise<CosStsResponse> {
    if (!allowedBizTypes.has(input.biz)) {
      throw new Error("不支持的业务类型");
    }

    if (!allowedImageTypes.has(input.fileType)) {
      throw new Error("不支持的文件类型");
    }

    const maxFileSizeMb = toNumber(process.env.COS_MAX_FILE_SIZE_MB, 10);
    const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;
    if (input.fileSize > maxFileSizeBytes) {
      throw new Error(`文件大小超过限制，最大 ${maxFileSizeMb}MB`);
    }
    if (input.withThumb && input.biz !== "note" && input.biz !== "cover") {
      throw new Error("仅手帐配图或封面支持缩略图上传凭证");
    }

    const quota = await consumeDailyQuota(input.userId, input.biz);

    const secretId = getRequiredEnv("COS_SECRET_ID");
    const secretKey = getRequiredEnv("COS_SECRET_KEY");
    const bucket = getRequiredEnv("COS_BUCKET");
    const region = getRequiredEnv("COS_REGION");
    const uploadDir = process.env.COS_UPLOAD_DIR || "journal";
    const publicDomain = process.env.COS_PUBLIC_DOMAIN || "";
    const durationSeconds = toNumber(process.env.COS_STS_DURATION_SECONDS, 1800);

    const date = new Date();
    const month = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
    const ext = getFileExt(input.fileName, input.fileType);
    const id = randomUUID();
    const key = `${uploadDir}/${input.userId}/${month}/${id}${ext}`;
    const thumbKey =
      input.withThumb === true ? `${uploadDir}/${input.userId}/${month}/${id}-mini.jpg` : undefined;
    const resources =
      thumbKey != null
        ? [createCosResource(bucket, region, key), createCosResource(bucket, region, thumbKey)]
        : [createCosResource(bucket, region, key)];

    const credential = await STS.getCredential({
      secretId,
      secretKey,
      durationSeconds,
      policy: {
        version: "2.0",
        statement: [
          {
            action: ["cos:PutObject", "cos:PostObject"],
            effect: "allow",
            resource: resources,
          },
        ],
      },
    });

    if (!credential?.credentials) {
      throw new Error("获取COS临时凭证失败");
    }

    const uploadHost = `https://${bucket}.cos.${region}.myqcloud.com`;
    const fileBase = publicDomain ? publicDomain.replace(/\/$/, "") : uploadHost;

    return {
      bucket,
      region,
      key,
      ...(thumbKey != null
        ? {
            thumbKey,
            thumbFileUrl: `${fileBase}/${thumbKey}`,
          }
        : {}),
      expiredTime: credential.expiredTime,
      tmpSecretId: credential.credentials.tmpSecretId,
      tmpSecretKey: credential.credentials.tmpSecretKey,
      sessionToken: credential.credentials.sessionToken,
      uploadHost,
      fileUrl: `${fileBase}/${key}`,
      quota,
    };
  }
}
