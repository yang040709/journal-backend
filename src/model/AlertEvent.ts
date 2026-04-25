import { Document, Schema, model } from "mongoose";
import { AlertSeverity } from "./AlertRule";

export type AlertEventStatus = "open" | "acknowledged" | "resolved" | "muted";

export interface IAlertEvent extends Document {
  eventId: string;
  ruleKey: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertEventStatus;
  triggeredAt: Date;
  lastHitAt: Date;
  resolvedAt?: Date | null;
  hitValue: number;
  baselineValue?: number;
  metricSnapshot: Record<string, unknown>;
  occurrenceCount: number;
  ackBy?: string;
  ackAt?: Date | null;
  ackRemark?: string;
  createdAt: Date;
  updatedAt: Date;
}

const alertEventSchema = new Schema<IAlertEvent>(
  {
    eventId: { type: String, required: true, unique: true, index: true, trim: true },
    ruleKey: { type: String, required: true, index: true, trim: true },
    ruleName: { type: String, required: true, trim: true, maxlength: 120 },
    severity: { type: String, enum: ["P1", "P2", "P3"], required: true, index: true },
    status: {
      type: String,
      enum: ["open", "acknowledged", "resolved", "muted"],
      default: "open",
      index: true,
    },
    triggeredAt: { type: Date, required: true, index: true },
    lastHitAt: { type: Date, required: true, index: true },
    resolvedAt: { type: Date, default: null },
    hitValue: { type: Number, required: true, min: 0 },
    baselineValue: { type: Number },
    metricSnapshot: { type: Schema.Types.Mixed, default: {} },
    occurrenceCount: { type: Number, default: 1, min: 1 },
    ackBy: { type: String, trim: true, default: "" },
    ackAt: { type: Date, default: null },
    ackRemark: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

alertEventSchema.index({ status: 1, severity: 1, triggeredAt: -1 });
alertEventSchema.index({ ruleKey: 1, triggeredAt: -1 });

export default model<IAlertEvent>("AlertEvent", alertEventSchema);
