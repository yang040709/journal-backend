import { Document, Schema, model } from "mongoose";

export type UploadBiz = "note" | "cover" | "avatar";

export interface IUserUploadQuotaDaily extends Document {
  userId: string;
  dateKey: string;
  baseLimit: number;
  extraQuota: number;
  usedCount: number;
  bizBreakdown: {
    note: number;
    cover: number;
    avatar: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const userUploadQuotaDailySchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    dateKey: {
      type: String,
      required: true,
      index: true,
    },
    baseLimit: {
      type: Number,
      required: true,
      default: 15,
      min: 0,
    },
    extraQuota: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    usedCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    bizBreakdown: {
      note: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
      cover: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
      avatar: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
    },
  },
  {
    timestamps: true,
  },
);

userUploadQuotaDailySchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export default model<IUserUploadQuotaDaily>("UserUploadQuotaDaily", userUploadQuotaDailySchema);
