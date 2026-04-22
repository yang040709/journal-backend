import { Document, Schema, model } from "mongoose";

export type PointsCampaignClaimResult = "success" | "rejected";

export interface IPointsCampaignClaim extends Document {
  campaignId: string;
  userId: string;
  pointValue: number;
  claimAt: Date;
  claimIp: string;
  claimUa: string;
  result: PointsCampaignClaimResult;
  rejectReason?: string;
  requestId: string;
  createdAt: Date;
  updatedAt: Date;
}

const pointsCampaignClaimSchema = new Schema<IPointsCampaignClaim>(
  {
    campaignId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    pointValue: { type: Number, required: true, min: 0 },
    claimAt: { type: Date, required: true, default: Date.now },
    claimIp: { type: String, default: "", trim: true, maxlength: 120 },
    claimUa: { type: String, default: "", trim: true, maxlength: 512 },
    result: { type: String, enum: ["success", "rejected"], required: true, default: "success" },
    rejectReason: { type: String, trim: true, maxlength: 120 },
    requestId: { type: String, trim: true, maxlength: 255, default: "" },
  },
  { timestamps: true },
);

pointsCampaignClaimSchema.index({ campaignId: 1, userId: 1 }, { unique: true });
pointsCampaignClaimSchema.index({ campaignId: 1, createdAt: -1 });

export default model<IPointsCampaignClaim>("PointsCampaignClaim", pointsCampaignClaimSchema);

