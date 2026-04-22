import { Document, Schema, model } from "mongoose";

export type PointsCampaignStatus = "draft" | "published" | "offline";

export interface IPointsCampaign extends Document {
  name: string;
  description: string;
  pointValue: number;
  quota: number;
  claimedCount: number;
  startAt: Date;
  endAt: Date;
  status: PointsCampaignStatus;
  successCopy: string;
  channelRemark?: string;
  miniCodeCosKey?: string;
  miniCodeUrl?: string;
  qrCodeCosKey?: string;
  qrCodeUrl?: string;
  codeGeneratedAt?: Date;
  codeGeneratedByAdminId?: string;
  codeGeneratedByAdminUsername?: string;
  createdByAdminId: string;
  createdByAdminUsername: string;
  updatedByAdminId: string;
  updatedByAdminUsername: string;
  createdAt: Date;
  updatedAt: Date;
}

const pointsCampaignSchema = new Schema<IPointsCampaign>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    pointValue: { type: Number, required: true, min: 1, max: 1_000_000 },
    quota: { type: Number, required: true, min: 1, max: 10_000_000 },
    claimedCount: { type: Number, default: 0, min: 0 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["draft", "published", "offline"],
      default: "draft",
      index: true,
    },
    successCopy: { type: String, default: "领取成功，可前往积分页查看", trim: true, maxlength: 200 },
    channelRemark: { type: String, default: "", trim: true, maxlength: 200 },
    miniCodeCosKey: { type: String, trim: true },
    miniCodeUrl: { type: String, trim: true },
    qrCodeCosKey: { type: String, trim: true },
    qrCodeUrl: { type: String, trim: true },
    codeGeneratedAt: { type: Date },
    codeGeneratedByAdminId: { type: String, trim: true },
    codeGeneratedByAdminUsername: { type: String, trim: true },
    createdByAdminId: { type: String, required: true, trim: true },
    createdByAdminUsername: { type: String, required: true, trim: true },
    updatedByAdminId: { type: String, required: true, trim: true },
    updatedByAdminUsername: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

pointsCampaignSchema.index({ status: 1, startAt: 1, endAt: 1 });
pointsCampaignSchema.index({ createdAt: -1 });

export default model<IPointsCampaign>("PointsCampaign", pointsCampaignSchema);

