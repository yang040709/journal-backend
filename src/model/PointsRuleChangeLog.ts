import { Document, Schema, model } from "mongoose";

export interface IPointsRuleChangeLog extends Document {
  adminId: string;
  adminUsername: string;
  oldRules: Record<string, unknown>;
  newRules: Record<string, unknown>;
  effectiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pointsRuleChangeLogSchema = new Schema(
  {
    adminId: { type: String, required: true, index: true },
    adminUsername: { type: String, required: true, trim: true },
    oldRules: { type: Schema.Types.Mixed, required: true },
    newRules: { type: Schema.Types.Mixed, required: true },
    effectiveAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

export default model<IPointsRuleChangeLog>("PointsRuleChangeLog", pointsRuleChangeLogSchema);
