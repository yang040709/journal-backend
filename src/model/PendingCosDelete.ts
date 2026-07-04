import { Schema, model, Document } from "mongoose";

export type PendingCosDeleteStatus = "pending" | "done" | "failed";

export interface IPendingCosDelete extends Document {
  /** COS object key */
  cosKey: string;
  userId?: string;
  /** 来源：gallery / purge / 等 */
  source?: string;
  status: PendingCosDeleteStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  nextRetryAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const pendingCosDeleteSchema = new Schema<IPendingCosDelete>(
  {
    cosKey: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: String,
      trim: true,
      index: true,
    },
    source: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "done", "failed"],
      default: "pending",
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
      min: 1,
    },
    lastError: {
      type: String,
      trim: true,
    },
    nextRetryAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

pendingCosDeleteSchema.index({ cosKey: 1 }, { unique: true });
pendingCosDeleteSchema.index({ status: 1, nextRetryAt: 1, createdAt: 1 });

const PendingCosDelete = model<IPendingCosDelete>(
  "PendingCosDelete",
  pendingCosDeleteSchema,
  "pending_cos_deletes",
);

export default PendingCosDelete;
