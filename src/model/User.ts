import { Schema, model, Document } from "mongoose";
import { coverPreviewList } from "../constant/img";

export interface IUser extends Document {
  userId: string;
  nickname?: string;
  avatarUrl?: string;
  bio?: string;
  membershipText?: string;
  /** 积分余额（看广告、兑换额度、后台调整） */
  points: number;
  /** 覆盖全局的每日激励视频次数上限；未设置则使用后台配置的默认值 */
  adRewardDailyLimit?: number | null;
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
  /** 用户手帐自定义标签（与系统预设合并为可选白名单），最多 12 个 */
  customNoteTags: string[];
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
    nickname: {
      type: String,
      trim: true,
      default: "",
      maxlength: 32,
    },
    avatarUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    bio: {
      type: String,
      trim: true,
      default: "手帐记录生活点滴",
      maxlength: 100,
    },
    membershipText: {
      type: String,
      trim: true,
      default: "",
      maxlength: 60,
    },
    points: {
      type: Number,
      default: 200,
      min: 0,
    },
    adRewardDailyLimit: {
      type: Number,
      min: 1,
      max: 999,
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
    customNoteTags: {
      type: [String],
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
