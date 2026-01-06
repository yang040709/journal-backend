import { Schema, model, Document } from "mongoose";

export interface IReminder extends Document {
  userId: string;
  noteId: string;
  title: string; // 日程标题（从手帐获取）
  content: string; // 提醒内容
  remindTime: Date; // 提醒时间
  messageId: string; // 微信消息模板ID
  subscriptionStatus: "pending" | "subscribed" | "cancelled"; // 订阅状态
  sendStatus: "pending" | "sent" | "failed"; // 发送状态
  retryCount: number; // 重试次数
  lastError?: string; // 最后错误信息
  sentAt?: Date; // 发送时间
  createdAt: Date;
  updatedAt: Date;
}

const reminderSchema = new Schema(
  {
    userId: {
      type: String,
      required: [true, "用户ID不能为空"],
      index: true,
    },
    noteId: {
      type: String,
      required: [true, "手帐ID不能为空"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "日程标题不能为空"],
      trim: true,
      maxlength: [200, "日程标题不能超过200个字符"],
    },
    content: {
      type: String,
      required: [true, "提醒内容不能为空"],
      trim: true,
      maxlength: [500, "提醒内容不能超过500个字符"],
    },
    remindTime: {
      type: Date,
      required: [true, "提醒时间不能为空"],
      index: true,
    },
    messageId: {
      type: String,
      required: [true, "消息模板ID不能为空"],
      default: "3eKAvMUDfwzRBOIUatLtDROUxHdECTNmvk9vGOKMLck",
    },
    subscriptionStatus: {
      type: String,
      enum: ["pending", "subscribed", "cancelled"],
      default: "pending",
      index: true,
    },
    sendStatus: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    lastError: {
      type: String,
      default: "",
    },
    sentAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  }
);

// 创建索引
reminderSchema.index({ userId: 1, remindTime: 1 });
reminderSchema.index({ remindTime: 1, sendStatus: 1 });
reminderSchema.index({ subscriptionStatus: 1, sendStatus: 1 });
reminderSchema.index({ noteId: 1 });

// 添加虚拟字段id
reminderSchema.virtual("id").get(function (this: any) {
  return this._id.toString();
});

export default model<IReminder>("Reminder", reminderSchema);
