import { Document, Schema, model } from "mongoose";

export type AdRewardType = "upload_quota" | "ai_journal_quota" | "points";

export interface IUserAdRewardLog extends Document {
  userId: string;
  rewardToken: string;
  rewardType: AdRewardType;
  rewardValue: number;
  adProvider: string;
  adUnitId: string;
  requestId: string;
  status: "success";
  createdAt: Date;
  updatedAt: Date;
}

const userAdRewardLogSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    rewardToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    rewardType: {
      type: String,
      required: true,
      enum: ["upload_quota", "ai_journal_quota", "points"],
      default: "upload_quota",
    },
    rewardValue: {
      type: Number,
      required: true,
      min: 1,
    },
    adProvider: {
      type: String,
      required: true,
      default: "",
    },
    adUnitId: {
      type: String,
      required: true,
      default: "",
    },
    requestId: {
      type: String,
      required: true,
      default: "",
    },
    status: {
      type: String,
      required: true,
      enum: ["success"],
      default: "success",
    },
  },
  {
    timestamps: true,
  },
);

userAdRewardLogSchema.index({ userId: 1, rewardType: 1, createdAt: -1 });

export default model<IUserAdRewardLog>("UserAdRewardLog", userAdRewardLogSchema);
