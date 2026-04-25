import { Document, Schema, model } from "mongoose";

export type UserMigrationTaskStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "rollback_failed";

export interface IUserMigrationModuleResult {
  name: string;
  scanned: number;
  covered: number;
  skipped: number;
  status: "success" | "failed" | "rolled_back";
  message?: string;
}

export interface IUserMigrationTask extends Document {
  taskId: string;
  sourceOpenid: string;
  targetOpenid: string;
  operator: string;
  remark: string;
  idempotencyKey: string;
  status: UserMigrationTaskStatus;
  precheckSummary?: Record<string, number>;
  moduleResults: IUserMigrationModuleResult[];
  errorMessage?: string;
  rollbackMessage?: string;
  attemptCount: number;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const moduleResultSchema = new Schema<IUserMigrationModuleResult>(
  {
    name: { type: String, required: true, trim: true },
    scanned: { type: Number, required: true, default: 0, min: 0 },
    covered: { type: Number, required: true, default: 0, min: 0 },
    skipped: { type: Number, required: true, default: 0, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ["success", "failed", "rolled_back"],
      default: "success",
    },
    message: { type: String, trim: true },
  },
  { _id: false },
);

const userMigrationTaskSchema = new Schema<IUserMigrationTask>(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    sourceOpenid: { type: String, required: true, index: true },
    targetOpenid: { type: String, required: true, index: true },
    operator: { type: String, required: true, trim: true },
    remark: { type: String, required: true, trim: true, maxlength: 500 },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "running", "success", "failed", "rollback_failed"],
      default: "pending",
      index: true,
    },
    precheckSummary: { type: Schema.Types.Mixed },
    moduleResults: { type: [moduleResultSchema], default: [] },
    errorMessage: { type: String, trim: true },
    rollbackMessage: { type: String, trim: true },
    attemptCount: { type: Number, required: true, default: 0, min: 0 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

userMigrationTaskSchema.index({ sourceOpenid: 1, targetOpenid: 1, createdAt: -1 });

export default model<IUserMigrationTask>("UserMigrationTask", userMigrationTaskSchema);
