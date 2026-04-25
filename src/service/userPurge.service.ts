import COS from "cos-nodejs-sdk-v5";
import mongoose from "mongoose";
import Activity from "../model/Activity";
import Note from "../model/Note";
import NoteBook from "../model/NoteBook";
import NoteExportLog from "../model/NoteExportLog";
import PointsCampaignClaim from "../model/PointsCampaignClaim";
import PointsLedger from "../model/PointsLedger";
import Reminder from "../model/Reminder";
import ShareSecurityTask from "../model/ShareSecurityTask";
import Template from "../model/Template";
import User from "../model/User";
import UserAdRewardLog from "../model/UserAdRewardLog";
import UserAiUsageDaily from "../model/UserAiUsageDaily";
import UserFeedback from "../model/UserFeedback";
import UserFeedbackImageQuotaDaily from "../model/UserFeedbackImageQuotaDaily";
import UserImageAsset from "../model/UserImageAsset";
import UserUploadQuotaDaily from "../model/UserUploadQuotaDaily";

type PurgeCollectionKey =
  | "notes"
  | "notebooks"
  | "reminders"
  | "templates"
  | "activities"
  | "adRewardLogs"
  | "pointsLedgers"
  | "uploadQuotaDaily"
  | "aiUsageDaily"
  | "feedbacks"
  | "feedbackImageQuotaDaily"
  | "shareSecurityTasks"
  | "noteExportLogs"
  | "pointsCampaignClaims"
  | "userImageAssets"
  | "user";

export type PurgeStats = Record<PurgeCollectionKey, number>;

export type PurgeExecutionResult = {
  userId: string;
  mongoUserId: string;
  dryRun: boolean;
  stats: PurgeStats;
  verify?: {
    ok: boolean;
    remaining: Partial<PurgeStats>;
  };
  cos?: {
    enabled: boolean;
    deletedKeys?: number;
    skippedKeys?: number;
    failedKeys?: number;
    error?: string;
  };
};

function toBoolQuery(v: unknown): boolean {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function blankStats(): PurgeStats {
  return {
    notes: 0,
    notebooks: 0,
    reminders: 0,
    templates: 0,
    activities: 0,
    adRewardLogs: 0,
    pointsLedgers: 0,
    uploadQuotaDaily: 0,
    aiUsageDaily: 0,
    feedbacks: 0,
    feedbackImageQuotaDaily: 0,
    shareSecurityTasks: 0,
    noteExportLogs: 0,
    pointsCampaignClaims: 0,
    userImageAssets: 0,
    user: 0,
  };
}

function getCosClient() {
  const secretId = process.env.COS_SECRET_ID || "";
  const secretKey = process.env.COS_SECRET_KEY || "";
  if (!secretId || !secretKey) {
    throw new Error("COS credentials missing");
  }
  return new COS({ SecretId: secretId, SecretKey: secretKey });
}

async function deleteCosObjects(keys: string[]) {
  const bucket = process.env.COS_BUCKET || "";
  const region = process.env.COS_REGION || "";
  if (!bucket || !region) throw new Error("COS_BUCKET/COS_REGION missing");
  const cos = getCosClient();

  const objects = keys.map((Key) => ({ Key }));
  const chunkSize = 1000; // COS 单次最多 1000

  let deletedKeys = 0;
  for (let i = 0; i < objects.length; i += chunkSize) {
    const batch = objects.slice(i, i + chunkSize);
    await new Promise<void>((resolve, reject) => {
      cos.deleteMultipleObject(
        {
          Bucket: bucket,
          Region: region,
          Objects: batch,
          Quiet: true,
        },
        (err, data) => {
          if (err) return reject(err);
          const deleted = Array.isArray((data as any)?.Deleted) ? (data as any).Deleted.length : 0;
          deletedKeys += deleted;
          resolve();
        },
      );
    });
  }

  return { deletedKeys };
}

function isMongoTransactionNotSupportedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e || "");
  return (
    msg.includes("Transaction numbers are only allowed on a replica set member or mongos") ||
    msg.includes("replica set") ||
    msg.includes("not supported") ||
    msg.includes("IllegalOperation")
  );
}

export class UserPurgeService {
  /**
   * 管理端 `:id` 是业务 userId（encodeURIComponent 后的），这里统一按 `User.userId` 查询。
   */
  static async purgeByBizUserId(
    bizUserId: string,
    options: {
      dryRun?: boolean;
      withCos?: boolean;
      verify?: boolean;
      useTransactionIfPossible?: boolean;
    } = {},
  ): Promise<PurgeExecutionResult | null> {
    const userId = String(bizUserId || "").trim();
    if (!userId) return null;
    const user = await User.findOne({ userId }).select("_id userId").lean();
    if (!user) return null;
    return UserPurgeService.purgeByMongoUserId(String(user._id), {
      ...options,
      userId,
    });
  }

  static async purgeByMongoUserId(
    mongoUserId: string,
    options: {
      userId?: string;
      dryRun?: boolean;
      withCos?: boolean;
      verify?: boolean;
      useTransactionIfPossible?: boolean;
    } = {},
  ): Promise<PurgeExecutionResult | null> {
    const id = String(mongoUserId || "").trim();
    if (!id) return null;

    const dryRun = Boolean(options.dryRun);
    const verify = options.verify !== false;
    const withCos = Boolean(options.withCos);
    const useTx = options.useTransactionIfPossible !== false;

    const u = await User.findById(id).select("userId").lean();
    if (!u) return null;
    const userId = String((u as any)?.userId || options.userId || "").trim();
    if (!userId) return null;

    const runCounts = async (): Promise<PurgeStats> => {
      const [
        notes,
        notebooks,
        reminders,
        templates,
        activities,
        adRewardLogs,
        pointsLedgers,
        uploadQuotaDaily,
        aiUsageDaily,
        feedbacks,
        feedbackImageQuotaDaily,
        shareSecurityTasks,
        noteExportLogs,
        pointsCampaignClaims,
        userImageAssets,
      ] = await Promise.all([
        Note.countDocuments({ userId }),
        NoteBook.countDocuments({ userId }),
        Reminder.countDocuments({ userId }),
        Template.countDocuments({ userId }),
        Activity.countDocuments({ userId }),
        UserAdRewardLog.countDocuments({ userId }),
        PointsLedger.countDocuments({ userId }),
        UserUploadQuotaDaily.countDocuments({ userId }),
        UserAiUsageDaily.countDocuments({ userId }),
        UserFeedback.countDocuments({ userId }),
        UserFeedbackImageQuotaDaily.countDocuments({ userId }),
        ShareSecurityTask.countDocuments({ userId }),
        NoteExportLog.countDocuments({ userId }),
        PointsCampaignClaim.countDocuments({ userId }),
        UserImageAsset.countDocuments({ userId }),
      ]);

      return {
        ...blankStats(),
        notes,
        notebooks,
        reminders,
        templates,
        activities,
        adRewardLogs,
        pointsLedgers,
        uploadQuotaDaily,
        aiUsageDaily,
        feedbacks,
        feedbackImageQuotaDaily,
        shareSecurityTasks,
        noteExportLogs,
        pointsCampaignClaims,
        userImageAssets,
        user: 1,
      };
    };

    const result: PurgeExecutionResult = {
      userId,
      mongoUserId: id,
      dryRun,
      stats: await runCounts(),
    };

    if (dryRun) {
      if (verify) {
        result.verify = { ok: true, remaining: {} };
      }
      if (withCos) {
        result.cos = { enabled: true, deletedKeys: 0, skippedKeys: 0, failedKeys: 0 };
      }
      return result;
    }

    const runDeletes = async (session?: mongoose.ClientSession) => {
      const opt = session ? { session } : undefined;
      await Promise.all([
        Note.deleteMany({ userId }, opt as any),
        NoteBook.deleteMany({ userId }, opt as any),
        Reminder.deleteMany({ userId }, opt as any),
        Template.deleteMany({ userId }, opt as any),
        Activity.deleteMany({ userId }, opt as any),
        UserAdRewardLog.deleteMany({ userId }, opt as any),
        PointsLedger.deleteMany({ userId }, opt as any),
        UserUploadQuotaDaily.deleteMany({ userId }, opt as any),
        UserAiUsageDaily.deleteMany({ userId }, opt as any),
        UserFeedback.deleteMany({ userId }, opt as any),
        UserFeedbackImageQuotaDaily.deleteMany({ userId }, opt as any),
        ShareSecurityTask.deleteMany({ userId }, opt as any),
        NoteExportLog.deleteMany({ userId }, opt as any),
        PointsCampaignClaim.deleteMany({ userId }, opt as any),
        UserImageAsset.deleteMany({ userId }, opt as any),
      ]);
      await User.deleteOne({ _id: id }, opt as any);
    };

    let cosKeys: string[] = [];
    if (withCos) {
      const docs = await UserImageAsset.find({ userId })
        .select("storageKey")
        .lean();
      const keys = docs
        .map((d: any) => String(d?.storageKey || "").trim())
        .filter(Boolean);
      // 仅删除看起来像 COS key 的项（避免 cover:{id} 这种业务去重键误删）
      cosKeys = keys.filter((k) => k.includes("/") && !k.startsWith("cover:"));
    }

    let session: mongoose.ClientSession | null = null;
    if (useTx) {
      try {
        session = await mongoose.startSession();
      } catch {
        session = null;
      }
    }

    try {
      if (session) {
        await session.withTransaction(async () => {
          await runDeletes(session!);
        });
      } else {
        await runDeletes();
      }
    } catch (e) {
      if (session && isMongoTransactionNotSupportedError(e)) {
        await runDeletes();
      } else {
        throw e;
      }
    } finally {
      session?.endSession();
    }

    if (withCos) {
      const cosOut: PurgeExecutionResult["cos"] = {
        enabled: true,
        deletedKeys: 0,
        skippedKeys: 0,
        failedKeys: 0,
      };
      try {
        if (cosKeys.length) {
          const { deletedKeys } = await deleteCosObjects(cosKeys);
          cosOut.deletedKeys = deletedKeys;
          cosOut.skippedKeys = Math.max(0, cosKeys.length - deletedKeys);
        } else {
          cosOut.skippedKeys = 0;
        }
      } catch (e) {
        cosOut.error = e instanceof Error ? e.message : String(e);
        cosOut.failedKeys = cosKeys.length;
      }
      result.cos = cosOut;
    } else {
      result.cos = { enabled: false };
    }

    if (verify) {
      const remaining = await runCounts();
      const remainingNonZero: Partial<PurgeStats> = {};
      for (const [k, v] of Object.entries(remaining) as Array<[PurgeCollectionKey, number]>) {
        if (k === "user") continue;
        if (v > 0) remainingNonZero[k] = v;
      }
      const userExists = await User.exists({ _id: id });
      const ok = Object.keys(remainingNonZero).length === 0 && !userExists;
      result.verify = {
        ok,
        remaining: remainingNonZero,
      };
    }

    return result;
  }

  static parseDryRunQuery(v: unknown): boolean {
    return toBoolQuery(v);
  }

  static parseWithCosQuery(v: unknown): boolean {
    return toBoolQuery(v);
  }
}

