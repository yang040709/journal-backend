import { Schema, model, Document } from "mongoose";
import { coverPreviewList } from "../constant/img";

export interface IUser extends Document {
  userId: string;
  /** 广告等额外 AI 调用次数（预留，当前未接入） */
  aiBonusQuota: number;
  uploadExtraQuotaTotal: number;
  quickCovers: string[];
  quickCoversUpdatedAt: Date;
  customCovers: Array<{
    _id: string;
    coverUrl: string;
    thumbUrl?: string;
    thumbKey?: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema(
  {
    userId: {
      type: String,
      index: true,
      unique: true,
      required: true,
    },
    aiBonusQuota: {
      type: Number,
      default: 0,
      min: 0,
    },
    uploadExtraQuotaTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    quickCovers: {
      type: [String],
      default: () => coverPreviewList.slice(0, 11), // 默认取前11个封面
    },
    quickCoversUpdatedAt: {
      type: Date,
      default: Date.now,
    },
    customCovers: {
      type: [
        new Schema(
          {
            coverUrl: {
              type: String,
              required: true,
              trim: true,
            },
            thumbUrl: {
              type: String,
              trim: true,
            },
            thumbKey: {
              type: String,
              trim: true,
            },
          },
          {
            _id: true,
            timestamps: true,
          },
        ),
      ],
      default: [],
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
  },
);

// 添加虚拟字段id
userSchema.virtual("id").get(function (this: any) {
  return this._id.toString();
});

export default model<IUser>("User", userSchema);
