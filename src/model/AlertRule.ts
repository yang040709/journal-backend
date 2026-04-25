import { Document, Schema, model } from "mongoose";

export type AlertSeverity = "P1" | "P2" | "P3";
export type AlertThresholdType = "count" | "rate" | "ratio_vs_baseline";

export interface AlertRuleStats {
  hitStreak: number;
  recoverStreak: number;
  lastEvaluatedAt?: Date;
  lastTriggeredAt?: Date;
  lastValue?: number;
  lastBaseline?: number;
}

export interface IAlertRule extends Document {
  ruleKey: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: AlertSeverity;
  windowMinutes: number;
  minSampleCount: number;
  thresholdType: AlertThresholdType;
  thresholdValue: number;
  recoverValue: number;
  consecutiveHits: number;
  cooldownMinutes: number;
  notifyChannels: string[];
  params: Record<string, unknown>;
  stats: AlertRuleStats;
  createdAt: Date;
  updatedAt: Date;
}

const alertRuleSchema = new Schema<IAlertRule>(
  {
    ruleKey: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    enabled: { type: Boolean, default: true, index: true },
    severity: { type: String, enum: ["P1", "P2", "P3"], default: "P2", index: true },
    windowMinutes: { type: Number, required: true, min: 1, max: 1440 },
    minSampleCount: { type: Number, required: true, min: 0, max: 1_000_000 },
    thresholdType: {
      type: String,
      enum: ["count", "rate", "ratio_vs_baseline"],
      required: true,
    },
    thresholdValue: { type: Number, required: true, min: 0 },
    recoverValue: { type: Number, required: true, min: 0 },
    consecutiveHits: { type: Number, default: 1, min: 1, max: 60 },
    cooldownMinutes: { type: Number, default: 10, min: 0, max: 1440 },
    notifyChannels: { type: [String], default: [] },
    params: { type: Schema.Types.Mixed, default: {} },
    stats: {
      hitStreak: { type: Number, default: 0, min: 0 },
      recoverStreak: { type: Number, default: 0, min: 0 },
      lastEvaluatedAt: { type: Date },
      lastTriggeredAt: { type: Date },
      lastValue: { type: Number },
      lastBaseline: { type: Number },
    },
  },
  { timestamps: true },
);

alertRuleSchema.index({ enabled: 1, severity: 1, updatedAt: -1 });

export default model<IAlertRule>("AlertRule", alertRuleSchema);
