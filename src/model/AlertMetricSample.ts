import { Document, Schema, model } from "mongoose";

export interface IAlertMetricSample extends Document {
  metricKey: string;
  bucketStart: Date;
  successCount: number;
  failCount: number;
  totalCount: number;
  tags?: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const alertMetricSampleSchema = new Schema<IAlertMetricSample>(
  {
    metricKey: { type: String, required: true, index: true, trim: true },
    bucketStart: { type: Date, required: true, index: true },
    successCount: { type: Number, default: 0, min: 0 },
    failCount: { type: Number, default: 0, min: 0 },
    totalCount: { type: Number, default: 0, min: 0 },
    tags: { type: Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

alertMetricSampleSchema.index({ metricKey: 1, bucketStart: -1 }, { unique: true });
alertMetricSampleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IAlertMetricSample>("AlertMetricSample", alertMetricSampleSchema);
