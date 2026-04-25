import { Document, Schema, model } from "mongoose";

export type UserReviewStatus = "on" | "off";

export interface IUserReview extends Document {
  content: string;
  username: string;
  tag: string;
  status: UserReviewStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const userReviewSchema = new Schema<IUserReview>(
  {
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    tag: {
      type: String,
      trim: true,
      maxlength: 64,
      default: "",
    },
    status: {
      type: String,
      enum: ["on", "off"],
      default: "on",
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: -999999,
      max: 999999,
      index: true,
    },
  },
  { timestamps: true },
);

userReviewSchema.index({ status: 1, sortOrder: -1, _id: -1 });
userReviewSchema.index({ sortOrder: -1, _id: -1 });

export default model<IUserReview>("UserReview", userReviewSchema);
