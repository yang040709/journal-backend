import { Schema, model, Document } from "mongoose";
import { LeanActivity } from "../types/mongoose";

export interface IActivity extends Document {
  type: "create" | "update" | "delete" | "share_enable" | "share_disable";
  target: "noteBook" | "note" | "reminder" | "template" | "cover";
  targetId: string;
  title: string;
  userId: string;
  createdAt: Date;
}

const activitySchema = new Schema(
  {
    type: {
      type: String,
      enum: ["create", "update", "delete", "share_enable", "share_disable"],
      required: [true, "活动类型不能为空"],
    },
    target: {
      type: String,
      enum: ["noteBook", "note", "reminder", "template", "cover"],
      required: [true, "活动目标不能为空"],
    },
    targetId: {
      type: String,
      required: [true, "目标ID不能为空"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "活动标题不能为空"],
      trim: true,
    },
    userId: {
      type: String,
      required: [true, "用户ID不能为空"],
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  },
);

// 创建索引
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ target: 1, targetId: 1 });

// 添加虚拟字段id
activitySchema.virtual("id").get(function (this: any) {
  return this._id.toString();
});

export default model<IActivity>("Activity", activitySchema);
export type { LeanActivity };
