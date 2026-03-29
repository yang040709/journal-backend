import { Document, Schema, model } from "mongoose";

export type PointsLedgerKind = "exchange_upload" | "exchange_ai" | "admin_adjust";

export interface IPointsLedger extends Document {
  userId: string;
  kind: PointsLedgerKind;
  /** 积分变动（负数表示扣减） */
  pointsDelta: number;
  /** 兑换时增加的永久上传额外张数或 AI 额外次数 */
  quotaDelta?: number;
  /** 兑换当时规则快照 */
  ruleSnapshot?: Record<string, unknown>;
  /** 后台调分原因 */
  reason?: string;
  adminId?: string;
  adminUsername?: string;
  createdAt: Date;
  updatedAt: Date;
}

const pointsLedgerSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    kind: {
      type: String,
      required: true,
      enum: ["exchange_upload", "exchange_ai", "admin_adjust"],
      index: true,
    },
    pointsDelta: {
      type: Number,
      required: true,
    },
    quotaDelta: {
      type: Number,
    },
    ruleSnapshot: {
      type: Schema.Types.Mixed,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    adminId: {
      type: String,
      trim: true,
      index: true,
    },
    adminUsername: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

pointsLedgerSchema.index({ userId: 1, createdAt: -1 });

export default model<IPointsLedger>("PointsLedger", pointsLedgerSchema);
