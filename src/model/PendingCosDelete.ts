import { Schema, model, Document } from "mongoose";

export type PendingCosDeleteStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed";

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
  /** 认领进入 processing 的时间，用于超时回收 */
  lockedAt?: Date | null;
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
      enum: ["pending", "processing", "done", "failed"],
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
    },
    lastError: {
      type: String,
      trim: true,
    },
    nextRetryAt: {
      type: Date,
      default: null,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

pendingCosDeleteSchema.index({ cosKey: 1 }, { unique: true });
pendingCosDeleteSchema.index({ status: 1, nextRetryAt: 1, createdAt: 1 });
pendingCosDeleteSchema.index({ status: 1, lockedAt: 1 });

const PendingCosDelete = model<IPendingCosDelete>(
  "PendingCosDelete",
  pendingCosDeleteSchema,
  "pending_cos_deletes",
);

export default PendingCosDelete;
