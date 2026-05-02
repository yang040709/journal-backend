import { randomUUID } from "crypto";
import mongoose from "mongoose";
import STS from "qcloud-cos-sts";
import AdminGalleryImage, { AdminGalleryBiz } from "../model/AdminGalleryImage";

type SupportedMime = "image/jpeg" | "image/png" | "image/webp";

export interface AdminGalleryStsInput {
  biz: AdminGalleryBiz;
  fileName: string;
  fileType: SupportedMime;
  fileSize: number;
  withThumb?: boolean;
}

export interface AdminGalleryStsResponse {
  bucket: string;
  region: string;
  key: string;
  thumbKey?: string;
  expiredTime: number;
  tmpSecretId: string;
  tmpSecretKey: string;
  sessionToken: string;
  uploadHost: string;
  fileUrl: string;
  thumbFileUrl?: string;
}

export interface RecordAdminGalleryImageInput {
  url: string;
  storageKey: string;
  mimeType: SupportedMime;
  size: number;
  width: number;
  height: number;
  biz: AdminGalleryBiz;
  thumbUrl?: string;
  thumbKey?: string;
  createdByAdminId: string;
  createdByAdminUsername?: string;
}

const allowedImageTypes = new Set<SupportedMime>(["image/jpeg", "image/png", "image/webp"]);
const allowedBizTypes = new Set<AdminGalleryBiz>(["system_cover"]);

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`环境变量缺失: ${name}`);
  }
  return value;
};

const toNumber = (value: string | undefined, fallbackValue: number): number => {
  if (!value) return fallbackValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
};

const getFileExt = (fileName: string, fileType: SupportedMime): string => {
  const normalized = String(fileName || "").trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex > -1 && dotIndex < normalized.length - 1) {
    return normalized.slice(dotIndex);
  }
  if (fileType === "image/jpeg") return ".jpg";
  if (fileType === "image/png") return ".png";
  return ".webp";
};

const createCosResource = (bucket: string, region: string, key: string): string => {
  const split = bucket.split("-");
  const appId = split[split.length - 1];
  return `qcs::cos:${region}:uid/${appId}:${bucket}/${key}`;
};

export class AdminGalleryService {
  static async createCosStsCredential(
    input: AdminGalleryStsInput,
  ): Promise<AdminGalleryStsResponse> {
    if (!allowedBizTypes.has(input.biz)) {
      throw new Error("不支持的图库业务类型");
    }
    if (!allowedImageTypes.has(input.fileType)) {
      throw new Error("仅支持 jpg/png/webp 图片");
    }

    const maxFileSizeMb = toNumber(process.env.ADMIN_GALLERY_MAX_FILE_SIZE_MB, 5);
    const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
      throw new Error("文件大小参数无效");
    }
    if (input.fileSize > maxFileSizeBytes) {
      throw new Error(`文件大小超过限制，最大 ${maxFileSizeMb}MB`);
    }

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
    const key = `${uploadDir}/admin-gallery/${input.biz}/${month}/${id}${ext}`;
    const thumbKey = input.withThumb ? `${uploadDir}/admin-gallery/${input.biz}/${month}/${id}-mini${ext}` : undefined;
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
      ...(thumbKey
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
    };
  }

  static async recordUploadedImage(input: RecordAdminGalleryImageInput) {
    const trimUrl = String(input.url || "").trim();
    const trimKey = String(input.storageKey || "").trim();
    if (!trimUrl || !/^https?:\/\//i.test(trimUrl)) {
      throw new Error("主图 URL 非法");
    }
    if (!trimKey) {
      throw new Error("storageKey 不能为空");
    }
    const doc = await AdminGalleryImage.findOneAndUpdate(
      { storageKey: trimKey },
      {
        $set: {
          url: trimUrl,
          thumbUrl: input.thumbUrl ? String(input.thumbUrl).trim() : undefined,
          thumbKey: input.thumbKey ? String(input.thumbKey).trim() : undefined,
          storageKey: trimKey,
          mimeType: input.mimeType,
          size: Math.max(0, Number(input.size || 0)),
          width: Math.max(0, Number(input.width || 0)),
          height: Math.max(0, Number(input.height || 0)),
          biz: input.biz,
          createdByAdminId: String(input.createdByAdminId || "").trim(),
          createdByAdminUsername: input.createdByAdminUsername
            ? String(input.createdByAdminUsername).trim()
            : undefined,
          hiddenFromGallery: false,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    return doc;
  }

  static async listImages(params: {
    page?: number;
    limit?: number;
    biz?: AdminGalleryBiz;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit || 20)));
    const skip = (page - 1) * limit;
    const biz = params.biz || "system_cover";
    const query = { biz, hiddenFromGallery: { $ne: true } };
    const [items, total] = await Promise.all([
      AdminGalleryImage.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AdminGalleryImage.countDocuments(query),
    ]);
    return { items, total, page, limit };
  }

  /** 仅从后台图库列表隐藏，不删除 COS 对象 */
  static async hideImage(id: string): Promise<boolean> {
    const trimmed = String(id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(trimmed)) {
      return false;
    }
    const res = await AdminGalleryImage.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(trimmed), biz: "system_cover" },
      { $set: { hiddenFromGallery: true } },
      { new: true },
    ).lean();
    return !!res;
  }
}
