import { Document, Schema, model } from "mongoose";

export type PointsLedgerKind =
  | "ad_reward"
  | "exchange_upload"
  | "exchange_ai"
  | "exchange_note_export"
  | "admin_adjust"
  | "feedback_reward";
export type PointsFlowType = "income" | "expense";
export type PointsOperatorType = "system" | "admin" | "user";

export interface IPointsLedger extends Document {
  userId: string;
  kind: PointsLedgerKind;
  /** 积分变动（负数表示扣减） */
  pointsDelta: number;
  flowType: PointsFlowType;
  bizType: string;
  bizId?: string;
  title?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  /** 兑换时增加的永久上传额外张数或 AI 额外次数 */
  quotaDelta?: number;
  /** 兑换当时规则快照 */
  ruleSnapshot?: Record<string, unknown>;
  operatorType?: PointsOperatorType;
  operatorId?: string;
  operatorName?: string;
  remark?: string;
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
      enum: [
        "ad_reward",
        "exchange_upload",
        "exchange_ai",
        "exchange_note_export",
        "admin_adjust",
        "feedback_reward",
      ],
      index: true,
    },
    pointsDelta: {
      type: Number,
      required: true,
    },
    flowType: {
      type: String,
      enum: ["income", "expense"],
      required: true,
      index: true,
    },
    bizType: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    bizId: {
      type: String,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    balanceBefore: {
      type: Number,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      min: 0,
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
    operatorType: {
      type: String,
      enum: ["system", "admin", "user"],
      index: true,
    },
    operatorId: {
      type: String,
      trim: true,
    },
    operatorName: {
      type: String,
      trim: true,
    },
    remark: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
  },
  { timestamps: true },
);

pointsLedgerSchema.index({ userId: 1, createdAt: -1 });
pointsLedgerSchema.index({ userId: 1, flowType: 1, createdAt: -1 });
pointsLedgerSchema.index({ userId: 1, pointsDelta: 1, createdAt: -1 });
pointsLedgerSchema.index({ bizType: 1, createdAt: -1 });
pointsLedgerSchema.index({ bizType: 1, bizId: 1 }, { unique: true, sparse: true });

export default model<IPointsLedger>("PointsLedger", pointsLedgerSchema);
