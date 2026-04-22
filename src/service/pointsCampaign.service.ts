import axios from "axios";
import COS from "cos-nodejs-sdk-v5";
import mongoose from "mongoose";
import PointsCampaign from "../model/PointsCampaign";
import PointsCampaignClaim from "../model/PointsCampaignClaim";
import PointsCampaignAdminLog from "../model/PointsCampaignAdminLog";
import User from "../model/User";
import PointsLedger from "../model/PointsLedger";
import { ActivityLogger } from "../utils/ActivityLogger";

type AdminActor = {
  id: string;
  username: string;
};

type CampaignStatusView = "not_started" | "claimable" | "sold_out" | "ended" | "already_claimed" | "offline";

export class CampaignNotFoundError extends Error {}
export class CampaignNotPublishedError extends Error {}
export class CampaignNotStartedError extends Error {}
export class CampaignEndedError extends Error {}
export class CampaignSoldOutError extends Error {}
export class CampaignAlreadyClaimedError extends Error {}

let wxAccessToken = "";
let wxAccessTokenExpireAt = 0;

function withProxyEnvDisabled<T>(fn: () => Promise<T>): Promise<T> {
  const keys = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"];
  const backup: Record<string, string | undefined> = {};
  for (const k of keys) {
    backup[k] = process.env[k];
    delete process.env[k];
  }
  return fn().finally(() => {
    for (const k of keys) {
      if (backup[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = backup[k];
      }
    }
  });
}

function getCosClient() {
  const secretId = process.env.COS_SECRET_ID || "";
  const secretKey = process.env.COS_SECRET_KEY || "";
  if (!secretId || !secretKey) {
    throw new Error("COS credentials missing");
  }
  return new COS({ SecretId: secretId, SecretKey: secretKey });
}

function getCosPublicUrl(key: string): string {
  const custom = String(process.env.COS_PUBLIC_DOMAIN || "").trim();
  if (custom) return `${custom.replace(/\/$/, "")}/${key}`;
  const bucket = process.env.COS_BUCKET || "";
  const region = process.env.COS_REGION || "";
  return `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
}

function toIso(v: unknown) {
  return v instanceof Date ? v.toISOString() : "";
}

function toCampaignId(v: unknown) {
  return String(v || "").trim();
}

async function getWeChatAccessToken(): Promise<string> {
  if (wxAccessToken && Date.now() < wxAccessTokenExpireAt) return wxAccessToken;
  const appId = process.env.WX_APPID || "";
  const secret = process.env.WX_SECRET || "";
  if (!appId || !secret) throw new Error("WX_APPID/WX_SECRET missing");
  const r = await withProxyEnvDisabled(() =>
    axios.get("https://api.weixin.qq.com/cgi-bin/token", {
      params: { grant_type: "client_credential", appid: appId, secret },
      proxy: false,
    }),
  );
  if (r.data?.errcode) {
    throw new Error(
      `wechat token error: ${r.data?.errcode} ${String(r.data?.errmsg || "").trim()}`,
    );
  }
  const token = String(r.data?.access_token || "");
  const expires = Number(r.data?.expires_in || 7200);
  if (!token) throw new Error("failed to get wechat token");
  wxAccessToken = token;
  wxAccessTokenExpireAt = Date.now() + Math.max(60, expires - 300) * 1000;
  return wxAccessToken;
}

function parseWeChatMaybeErrorBuffer(raw: unknown, source: string): Buffer {
  const buf = Buffer.from(raw as ArrayBuffer);
  // 微信报错时常返回 JSON 文本；成功时是图片二进制
  const text = buf.toString("utf8").trim();
  if (text.startsWith("{") && text.includes("errcode")) {
    try {
      const parsed = JSON.parse(text) as { errcode?: number; errmsg?: string };
      if (parsed?.errcode && parsed.errcode !== 0) {
        throw new Error(
          `${source} failed: ${parsed.errcode} ${String(parsed.errmsg || "").trim()}`,
        );
      }
    } catch (e) {
      if (e instanceof Error) throw e;
    }
  }
  return buf;
}

async function uploadBufferToCos(key: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = process.env.COS_BUCKET || "";
  const region = process.env.COS_REGION || "";
  if (!bucket || !region) throw new Error("COS_BUCKET/COS_REGION missing");
  const cos = getCosClient();
  await new Promise<void>((resolve, reject) => {
    cos.putObject(
      { Bucket: bucket, Region: region, Key: key, Body: body, ContentType: contentType },
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
  return getCosPublicUrl(key);
}

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const maybe = e as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
    const msg = typeof maybe.message === "string" ? maybe.message : "";
    const code = maybe.code != null ? String(maybe.code) : "";
    const status = maybe.statusCode ?? maybe.status;
    const statusText = status != null ? String(status) : "";
    const merged = [code, statusText, msg].filter(Boolean).join(" ");
    if (merged) return merged;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
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

export class PointsCampaignService {
  private static serializeCampaign(
    doc: Record<string, any>,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> & { displayStatus: CampaignStatusView } {
    const now = Date.now();
    const startAt = new Date(String(doc.startAt || 0)).getTime();
    const endAt = new Date(String(doc.endAt || 0)).getTime();
    const status = String(doc.status || "draft");
    const claimed = Number(doc.claimedCount || 0);
    const quota = Number(doc.quota || 0);
    let displayStatus: CampaignStatusView = "offline";
    if (status !== "published") displayStatus = "offline";
    else if (now < startAt) displayStatus = "not_started";
    else if (now > endAt) displayStatus = "ended";
    else if (claimed >= quota) displayStatus = "sold_out";
    else displayStatus = "claimable";
    return {
      id: toCampaignId(doc._id),
      name: String(doc.name || ""),
      description: String(doc.description || ""),
      pointValue: Number(doc.pointValue || 0),
      quota,
      claimedCount: claimed,
      startAt: toIso(doc.startAt),
      endAt: toIso(doc.endAt),
      status,
      displayStatus,
      successCopy: String(doc.successCopy || ""),
      channelRemark: String(doc.channelRemark || ""),
      miniCodeUrl: String(doc.miniCodeUrl || ""),
      qrCodeUrl: String(doc.qrCodeUrl || ""),
      codeGeneratedAt: toIso(doc.codeGeneratedAt),
      createdAt: toIso(doc.createdAt),
      updatedAt: toIso(doc.updatedAt),
      ...extra,
    } as Record<string, unknown> & { displayStatus: CampaignStatusView };
  }

  static async createCampaign(
    payload: {
      name: string;
      description?: string;
      pointValue: number;
      quota: number;
      startAt: Date;
      endAt: Date;
      successCopy?: string;
      channelRemark?: string;
    },
    admin: AdminActor,
    requestId: string,
  ) {
    const now = new Date();
    const doc = await PointsCampaign.create({
      name: payload.name.trim(),
      description: String(payload.description || "").trim(),
      pointValue: Math.floor(payload.pointValue),
      quota: Math.floor(payload.quota),
      claimedCount: 0,
      startAt: payload.startAt,
      endAt: payload.endAt,
      status: "draft",
      successCopy: String(payload.successCopy || "领取成功，可前往积分页查看").trim(),
      channelRemark: String(payload.channelRemark || "").trim(),
      createdByAdminId: admin.id,
      createdByAdminUsername: admin.username,
      updatedByAdminId: admin.id,
      updatedByAdminUsername: admin.username,
      createdAt: now,
      updatedAt: now,
    });
    await PointsCampaignAdminLog.create({
      campaignId: String(doc._id),
      action: "create",
      adminId: admin.id,
      adminUsername: admin.username,
      requestId,
      payload: { name: payload.name, pointValue: payload.pointValue, quota: payload.quota },
    });
    return PointsCampaignService.serializeCampaign(doc.toObject());
  }

  static async updateCampaign(
    id: string,
    payload: Partial<{
      name: string;
      description: string;
      pointValue: number;
      quota: number;
      startAt: Date;
      endAt: Date;
      successCopy: string;
      channelRemark: string;
    }>,
    admin: AdminActor,
    requestId: string,
  ) {
    const current = await PointsCampaign.findById(id).lean();
    if (!current) throw new CampaignNotFoundError("campaign not found");
    const nextStartAt = payload.startAt ?? current.startAt;
    const nextEndAt = payload.endAt ?? current.endAt;
    if (new Date(nextStartAt).getTime() >= new Date(nextEndAt).getTime()) {
      throw new Error("结束时间必须晚于开始时间");
    }

    const patch: Record<string, unknown> = { updatedByAdminId: admin.id, updatedByAdminUsername: admin.username };
    if (payload.name != null) patch.name = payload.name.trim();
    if (payload.description != null) patch.description = payload.description.trim();
    if (payload.pointValue != null) patch.pointValue = Math.floor(payload.pointValue);
    if (payload.quota != null) patch.quota = Math.floor(payload.quota);
    if (payload.startAt != null) patch.startAt = payload.startAt;
    if (payload.endAt != null) patch.endAt = payload.endAt;
    if (payload.successCopy != null) patch.successCopy = payload.successCopy.trim();
    if (payload.channelRemark != null) patch.channelRemark = payload.channelRemark.trim();
    const doc = await PointsCampaign.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!doc) throw new CampaignNotFoundError("campaign not found");
    await PointsCampaignAdminLog.create({
      campaignId: toCampaignId(doc._id),
      action: "update",
      adminId: admin.id,
      adminUsername: admin.username,
      requestId,
      payload: patch,
    });
    return PointsCampaignService.serializeCampaign(doc);
  }

  private static async generateCampaignCodes(campaignId: string) {
    const token = await getWeChatAccessToken();
    const page = "pages/points-campaign/points-campaign";
    const scene = `cid=${campaignId}`.slice(0, 32);
    const miniCodeRes = await withProxyEnvDisabled(() =>
      axios.post(
        `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`,
        {
          scene,
          page,
          check_path: false,
          env_version: "release",
        },
        { responseType: "arraybuffer", proxy: false },
      ),
    );
    const miniCodeBuffer = parseWeChatMaybeErrorBuffer(miniCodeRes.data, "wechat mini-code api");
    const qrCodeRes = await withProxyEnvDisabled(() =>
      axios.post(
        `https://api.weixin.qq.com/cgi-bin/wxaapp/createwxaqrcode?access_token=${token}`,
        {
          path: `${page}?campaignId=${campaignId}`,
          width: 430,
        },
        { responseType: "arraybuffer", proxy: false },
      ),
    );
    const qrCodeBuffer = parseWeChatMaybeErrorBuffer(qrCodeRes.data, "wechat qrcode api");
    const baseDir = process.env.COS_UPLOAD_DIR || "journal";
    const month = new Date().toISOString().slice(0, 7).replace("-", "");
    const miniCodeCosKey = `${baseDir}/campaigns/${month}/${campaignId}-mini.png`;
    const qrCodeCosKey = `${baseDir}/campaigns/${month}/${campaignId}-qr.png`;
    const [miniCodeUrl, qrCodeUrl] = await Promise.all([
      uploadBufferToCos(miniCodeCosKey, miniCodeBuffer, "image/png"),
      uploadBufferToCos(qrCodeCosKey, qrCodeBuffer, "image/png"),
    ]);
    return { miniCodeCosKey, miniCodeUrl, qrCodeCosKey, qrCodeUrl };
  }

  static async publishCampaign(id: string, admin: AdminActor, requestId: string) {
    const doc = await PointsCampaign.findById(id).lean();
    if (!doc) throw new CampaignNotFoundError("campaign not found");
    let codeAssets: {
      miniCodeCosKey: string;
      miniCodeUrl: string;
      qrCodeCosKey: string;
      qrCodeUrl: string;
    };
    try {
      codeAssets = await PointsCampaignService.generateCampaignCodes(toCampaignId(doc._id));
    } catch (e) {
      const msg = toErrorMessage(e);
      throw new Error(`publish campaign code generation failed: ${msg}`);
    }
    const now = new Date();
    const updated = await PointsCampaign.findByIdAndUpdate(
      id,
      {
        $set: {
          status: "published",
          ...codeAssets,
          codeGeneratedAt: now,
          codeGeneratedByAdminId: admin.id,
          codeGeneratedByAdminUsername: admin.username,
          updatedByAdminId: admin.id,
          updatedByAdminUsername: admin.username,
        },
      },
      { new: true },
    ).lean();
    if (!updated) throw new CampaignNotFoundError("campaign not found");
    await PointsCampaignAdminLog.create({
      campaignId: toCampaignId(updated._id),
      action: "publish",
      adminId: admin.id,
      adminUsername: admin.username,
      requestId,
      payload: codeAssets,
    });
    return PointsCampaignService.serializeCampaign(updated);
  }

  static async offlineCampaign(id: string, admin: AdminActor, requestId: string) {
    const updated = await PointsCampaign.findByIdAndUpdate(
      id,
      { $set: { status: "offline", updatedByAdminId: admin.id, updatedByAdminUsername: admin.username } },
      { new: true },
    ).lean();
    if (!updated) throw new CampaignNotFoundError("campaign not found");
    await PointsCampaignAdminLog.create({
      campaignId: toCampaignId(updated._id),
      action: "offline",
      adminId: admin.id,
      adminUsername: admin.username,
      requestId,
    });
    return PointsCampaignService.serializeCampaign(updated);
  }

  static async listCampaigns(query: {
    page: number;
    limit: number;
    status?: "draft" | "published" | "offline";
    keyword?: string;
  }) {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.keyword?.trim()) where.name = { $regex: query.keyword.trim(), $options: "i" };
    const [items, total] = await Promise.all([
      PointsCampaign.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PointsCampaign.countDocuments(where),
    ]);
    return {
      items: items.map((x) => PointsCampaignService.serializeCampaign(x)),
      total,
      page,
      limit,
    };
  }

  static async getCampaignForAdmin(id: string) {
    const doc = await PointsCampaign.findById(id).lean();
    if (!doc) throw new CampaignNotFoundError("campaign not found");
    const [claimsTotal, logs] = await Promise.all([
      PointsCampaignClaim.countDocuments({ campaignId: toCampaignId(doc._id), result: "success" }),
      PointsCampaignAdminLog.find({ campaignId: toCampaignId(doc._id) }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    return {
      ...PointsCampaignService.serializeCampaign(doc),
      claimsTotal,
      adminLogs: logs.map((x) => ({
        id: toCampaignId(x._id),
        action: x.action,
        adminId: x.adminId,
        adminUsername: x.adminUsername,
        requestId: x.requestId,
        payload: x.payload || {},
        createdAt: toIso(x.createdAt),
      })),
    };
  }

  static async listCampaignClaims(campaignId: string, page: number, limit: number) {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    const skip = (p - 1) * l;
    const [items, total] = await Promise.all([
      PointsCampaignClaim.find({ campaignId }).sort({ createdAt: -1 }).skip(skip).limit(l).lean(),
      PointsCampaignClaim.countDocuments({ campaignId }),
    ]);
    return {
      items: items.map((x) => ({
        id: toCampaignId(x._id),
        userId: x.userId,
        pointValue: Number(x.pointValue || 0),
        claimAt: toIso(x.claimAt),
        claimIp: x.claimIp || "",
        result: x.result,
        rejectReason: x.rejectReason || "",
        requestId: x.requestId || "",
      })),
      total,
      page: p,
      limit: l,
    };
  }

  static async getCampaignForUser(campaignId: string, userId: string) {
    const doc = await PointsCampaign.findById(campaignId).lean();
    if (!doc || doc.status !== "published") throw new CampaignNotFoundError("campaign not found");
    const claimed = await PointsCampaignClaim.exists({ campaignId, userId, result: "success" });
    const data = PointsCampaignService.serializeCampaign(doc, {
      userClaimed: Boolean(claimed),
    });
    if (data.displayStatus === "claimable" && claimed) {
      data.displayStatus = "already_claimed";
    }
    return data;
  }

  static async claimCampaign(
    campaignId: string,
    userId: string,
    ctxMeta: { ip: string; ua: string; requestId: string },
  ) {
    const runNonTx = async () => {
    const doc = await PointsCampaign.findById(campaignId).lean();
    if (!doc) throw new CampaignNotFoundError("campaign not found");
    if (doc.status !== "published") throw new CampaignNotPublishedError("campaign not published");
    const now = Date.now();
    if (now < new Date(String(doc.startAt || 0)).getTime()) throw new CampaignNotStartedError("campaign not started");
    if (now > new Date(String(doc.endAt || 0)).getTime()) throw new CampaignEndedError("campaign ended");

    const existed = await PointsCampaignClaim.findOne({ campaignId, userId, result: "success" })
      .select("_id")
      .lean();
    if (existed) throw new CampaignAlreadyClaimedError("already claimed");

    const updatedCampaign = await PointsCampaign.findOneAndUpdate(
      { _id: campaignId, claimedCount: { $lt: Number(doc.quota || 0) }, status: "published" },
      { $inc: { claimedCount: 1 } },
      { new: true },
    ).lean();
    if (!updatedCampaign) throw new CampaignSoldOutError("campaign sold out");

    const pointValue = Math.max(1, Math.floor(Number(updatedCampaign.pointValue || 0)));
    try {
      await PointsCampaignClaim.create({
        campaignId,
        userId,
        pointValue,
        claimAt: new Date(),
        claimIp: ctxMeta.ip,
        claimUa: ctxMeta.ua,
        result: "success",
        requestId: ctxMeta.requestId,
      });
    } catch (err: unknown) {
      const e = err as { code?: number };
      await PointsCampaign.updateOne({ _id: campaignId }, { $inc: { claimedCount: -1 } });
      if (e?.code === 11000) {
        throw new CampaignAlreadyClaimedError("already claimed");
      }
      throw err;
    }

    let balanceAfter = 0;
    let balanceBefore = 0;
    try {
      const userDoc = await User.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId }, $inc: { points: pointValue } },
        { upsert: true, new: true },
      ).lean();
      balanceAfter = Math.max(0, Math.floor(Number((userDoc as { points?: number })?.points || 0)));
      balanceBefore = Math.max(0, balanceAfter - pointValue);
    } catch (err: unknown) {
      await PointsCampaign.updateOne({ _id: campaignId }, { $inc: { claimedCount: -1 } });
      await PointsCampaignClaim.deleteOne({ campaignId, userId, result: "success" });
      throw err;
    }

    const bizId = `campaign_claim_${campaignId}_${userId}`;
    try {
      await PointsLedger.create({
        userId,
        kind: "campaign_claim",
        bizType: "campaign_claim",
        bizId,
        title: `领取活动积分：${String(updatedCampaign.name || "")}`,
        flowType: "income",
        pointsDelta: pointValue,
        balanceBefore,
        balanceAfter,
        operatorType: "system",
        operatorId: "points.campaign",
        operatorName: "system",
        remark: String(updatedCampaign.successCopy || ""),
      });
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e?.code !== 11000) {
        console.error("[pointsCampaign.claimCampaign] create ledger failed", {
          campaignId,
          userId,
          requestId: ctxMeta.requestId,
          error: toErrorMessage(err),
        });
      }
    }

    void ActivityLogger.record(
      {
        type: "update",
        target: "user",
        targetId: userId,
        title: `领取活动积分 +${pointValue}`,
        userId,
      },
      { blocking: false },
    );

    return {
      rewardPoints: pointValue,
      points: balanceAfter,
      successCopy: String(updatedCampaign.successCopy || "领取成功，可前往积分页查看"),
      redirectUrl: "/packages/me-insights/pages/points/points",
    };
    };

    let session: mongoose.ClientSession | null = null;
    try {
      session = await mongoose.startSession();
    } catch {
      session = null;
    }

    if (!session) {
      return runNonTx();
    }

    try {
      const data = await session.withTransaction(async () => {
        const doc = await PointsCampaign.findById(campaignId).session(session!).lean();
        if (!doc) throw new CampaignNotFoundError("campaign not found");
        if (doc.status !== "published") throw new CampaignNotPublishedError("campaign not published");
        const now = Date.now();
        if (now < new Date(String(doc.startAt || 0)).getTime()) throw new CampaignNotStartedError("campaign not started");
        if (now > new Date(String(doc.endAt || 0)).getTime()) throw new CampaignEndedError("campaign ended");

        const existed = await PointsCampaignClaim.findOne({ campaignId, userId, result: "success" })
          .select("_id")
          .session(session!)
          .lean();
        if (existed) throw new CampaignAlreadyClaimedError("already claimed");

        const updatedCampaign = await PointsCampaign.findOneAndUpdate(
          { _id: campaignId, claimedCount: { $lt: Number(doc.quota || 0) }, status: "published" },
          { $inc: { claimedCount: 1 } },
          { new: true, session: session! },
        ).lean();
        if (!updatedCampaign) throw new CampaignSoldOutError("campaign sold out");

        const pointValue = Math.max(1, Math.floor(Number(updatedCampaign.pointValue || 0)));

        try {
          await PointsCampaignClaim.create(
            [
              {
                campaignId,
                userId,
                pointValue,
                claimAt: new Date(),
                claimIp: ctxMeta.ip,
                claimUa: ctxMeta.ua,
                result: "success",
                requestId: ctxMeta.requestId,
              },
            ],
            { session: session! },
          );
        } catch (err: unknown) {
          const e = err as { code?: number };
          if (e?.code === 11000) throw new CampaignAlreadyClaimedError("already claimed");
          throw err;
        }

        const userDoc = await User.findOneAndUpdate(
          { userId },
          { $setOnInsert: { userId }, $inc: { points: pointValue } },
          { upsert: true, new: true, session: session! },
        ).lean();
        const balanceAfter = Math.max(0, Math.floor(Number((userDoc as { points?: number })?.points || 0)));
        const balanceBefore = Math.max(0, balanceAfter - pointValue);

        const bizId = `campaign_claim_${campaignId}_${userId}`;
        try {
          await PointsLedger.create(
            [
              {
                userId,
                kind: "campaign_claim",
                bizType: "campaign_claim",
                bizId,
                title: `领取活动积分：${String(updatedCampaign.name || "")}`,
                flowType: "income",
                pointsDelta: pointValue,
                balanceBefore,
                balanceAfter,
                operatorType: "system",
                operatorId: "points.campaign",
                operatorName: "system",
                remark: String(updatedCampaign.successCopy || ""),
              },
            ],
            { session: session! },
          );
        } catch (err: unknown) {
          const e = err as { code?: number };
          if (e?.code !== 11000) {
            console.error("[pointsCampaign.claimCampaign] create ledger failed (tx)", {
              campaignId,
              userId,
              requestId: ctxMeta.requestId,
              error: toErrorMessage(err),
            });
          }
        }

        void ActivityLogger.record(
          {
            type: "update",
            target: "user",
            targetId: userId,
            title: `领取活动积分 +${pointValue}`,
            userId,
          },
          { blocking: false },
        );

        return {
          rewardPoints: pointValue,
          points: balanceAfter,
          successCopy: String(updatedCampaign.successCopy || "领取成功，可前往积分页查看"),
          redirectUrl: "/packages/me-insights/pages/points/points",
        };
      });
      return data;
    } catch (e) {
      if (isMongoTransactionNotSupportedError(e)) {
        return runNonTx();
      }
      throw e;
    } finally {
      session.endSession();
    }
  }
}

