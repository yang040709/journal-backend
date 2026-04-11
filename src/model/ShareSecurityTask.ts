import { Schema, model, Document } from "mongoose";

export const shareSecurityTaskStatusList = [
  "queued",
  "running",
  "pass",
  "risky_wechat",
  "reject_local",
  "reject_wechat",
  "error",
] as const;

export type ShareSecurityTaskStatus = (typeof shareSecurityTaskStatusList)[number];

export interface ShareRiskSnapshotImage {
  key?: string;
  url: string;
  thumbUrl?: string;
}

export interface ShareRiskSnapshot {
  title: string;
  content: string;
  tags: string[];
  images: ShareRiskSnapshotImage[];
  riskMeta: {
    source: "local" | "wechat_text" | "wechat_image";
    code?: string;
    detail?: string;
    traceId?: string;
  };
}

export interface IShareSecurityTask extends Document {
  taskId: string;
  noteId: string;
  userId: string;
  shareVersion: number;
  scene: "share_enable";
  source: "local" | "wechat_text" | "wechat_image";
  textPayloadDigest?: string;
  imageCount: number;
  status: ShareSecurityTaskStatus;
  wechatTraceId?: string;
  resultCode?: string;
  resultDetail?: string;
  retryCount: number;
  nextRetryAt?: Date | null;
  snapshot?: ShareRiskSnapshot;
  createdAt: Date;
  updatedAt: Date;
}

const shareSecurityTaskSchema = new Schema<IShareSecurityTask>(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    noteId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    shareVersion: { type: Number, required: true, min: 0, index: true },
    scene: { type: String, required: true, enum: ["share_enable"], default: "share_enable" },
    source: {
      type: String,
      required: true,
      enum: ["local", "wechat_text", "wechat_image"],
      index: true,
    },
    textPayloadDigest: { type: String, trim: true },
    imageCount: { type: Number, default: 0, min: 0 },
    status: { type: String, required: true, enum: shareSecurityTaskStatusList, index: true },
    wechatTraceId: { type: String, trim: true },
    resultCode: { type: String, trim: true },
    resultDetail: { type: String, trim: true },
    retryCount: { type: Number, default: 0, min: 0 },
    nextRetryAt: { type: Date, default: null, index: true },
    snapshot: {
      title: { type: String, default: "" },
      content: { type: String, default: "" },
      tags: { type: [String], default: [] },
      images: {
        type: [
          {
            key: { type: String, trim: true },
            url: { type: String, trim: true, required: true },
            thumbUrl: { type: String, trim: true },
          },
        ],
        default: [],
      },
      riskMeta: {
        source: {
          type: String,
          enum: ["local", "wechat_text", "wechat_image"],
          required: true,
        },
        code: { type: String, trim: true },
        detail: { type: String, trim: true },
        traceId: { type: String, trim: true },
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

shareSecurityTaskSchema.index({ noteId: 1, shareVersion: 1, createdAt: -1 });
shareSecurityTaskSchema.index({ status: 1, updatedAt: 1 });
shareSecurityTaskSchema.index({ taskId: 1 });

shareSecurityTaskSchema.virtual("id").get(function (this: any) {
  return this._id.toString();
});

export default model<IShareSecurityTask>("ShareSecurityTask", shareSecurityTaskSchema);
