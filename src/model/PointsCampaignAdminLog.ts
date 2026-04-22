import { Document, Schema, model } from "mongoose";

export interface IPointsCampaignAdminLog extends Document {
  campaignId: string;
  action: "create" | "update" | "publish" | "offline";
  adminId: string;
  adminUsername: string;
  requestId: string;
  payload?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const pointsCampaignAdminLogSchema = new Schema<IPointsCampaignAdminLog>(
  {
    campaignId: { type: String, required: true, index: true },
    action: { type: String, enum: ["create", "update", "publish", "offline"], required: true },
    adminId: { type: String, required: true, trim: true },
    adminUsername: { type: String, required: true, trim: true },
    requestId: { type: String, default: "", trim: true, maxlength: 255 },
    payload: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

pointsCampaignAdminLogSchema.index({ campaignId: 1, createdAt: -1 });

export default model<IPointsCampaignAdminLog>(
  "PointsCampaignAdminLog",
  pointsCampaignAdminLogSchema,
);

