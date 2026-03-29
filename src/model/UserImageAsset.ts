import { Schema, model, Document } from "mongoose";

export type UserImageAssetSource = "note" | "cover";

export interface IUserImageAsset extends Document {
  userId: string;
  /** 去重键：手帐图为 COS key；自定义封面为 cover:{coverId} */
  storageKey: string;
  /** 主图 URL（预览用大图） */
  url: string;
  /** 列表缩略图（可选） */
  thumbUrl?: string;
  thumbKey?: string;
  source: UserImageAssetSource;
  /** noteId 或 customCover 子文档 id */
  refId: string;
  width: number;
  height: number;
  size: number;
  mimeType?: "image/jpeg" | "image/png" | "image/webp";
  createdAt: Date;
  updatedAt: Date;
}

const userImageAssetSchema = new Schema<IUserImageAsset>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    thumbUrl: {
      type: String,
      trim: true,
    },
    thumbKey: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      required: true,
      enum: ["note", "cover"],
    },
    refId: {
      type: String,
      required: true,
      trim: true,
    },
    width: { type: Number, default: 0, min: 0 },
    height: { type: Number, default: 0, min: 0 },
    size: { type: Number, default: 0, min: 0 },
    mimeType: {
      type: String,
      enum: ["image/jpeg", "image/png", "image/webp"],
    },
  },
  { timestamps: true },
);

userImageAssetSchema.index({ userId: 1, storageKey: 1 }, { unique: true });
userImageAssetSchema.index({ userId: 1, createdAt: -1 });
userImageAssetSchema.index({ userId: 1, source: 1, createdAt: -1 });

const UserImageAsset = model<IUserImageAsset>(
  "UserImageAsset",
  userImageAssetSchema,
  "user_image_assets",
);

export default UserImageAsset;
