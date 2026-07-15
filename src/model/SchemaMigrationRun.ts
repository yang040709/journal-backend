import { Document, Schema, model } from "mongoose";

export const schemaMigrationRunStatusList = [
  "running",
  "success",
  "failed",
] as const;

export type SchemaMigrationRunStatus =
  (typeof schemaMigrationRunStatusList)[number];

export interface ISchemaMigrationRunMeta {
  scanned?: number;
  modified?: number;
  message?: string;
}

export interface ISchemaMigrationRun extends Document {
  name: string;
  version: number;
  status: SchemaMigrationRunStatus;
  attemptCount: number;
  startedAt?: Date;
  finishedAt?: Date;
  lockedAt?: Date;
  meta?: ISchemaMigrationRunMeta;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const metaSchema = new Schema<ISchemaMigrationRunMeta>(
  {
    scanned: { type: Number, min: 0 },
    modified: { type: Number, min: 0 },
    message: { type: String, trim: true },
  },
  { _id: false },
);

const schemaMigrationRunSchema = new Schema<ISchemaMigrationRun>(
  {
    name: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: schemaMigrationRunStatusList,
      default: "running",
      index: true,
    },
    attemptCount: { type: Number, required: true, default: 0, min: 0 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    lockedAt: { type: Date },
    meta: { type: metaSchema },
    errorMessage: { type: String, trim: true },
  },
  { timestamps: true },
);

schemaMigrationRunSchema.index({ name: 1, version: 1 }, { unique: true });

export default model<ISchemaMigrationRun>(
  "SchemaMigrationRun",
  schemaMigrationRunSchema,
);
