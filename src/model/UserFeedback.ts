import { Document, Schema, model } from "mongoose";

export type FeedbackType = "bug" | "rant" | "demand" | "praise";
export type FeedbackStatus = "pending" | "reviewed";
export type FeedbackReviewLevel = "trash" | "normal" | "important" | "critical";

export interface IUserFeedback extends Document {
  userId: string;
  type: FeedbackType;
  content: string;
  contact?: string;
  images: string[];
  clientMeta?: Record<string, unknown> | null;
  status: FeedbackStatus;
  reviewLevel?: FeedbackReviewLevel;
  reviewRemark?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  weeklyFirstRewardGranted: boolean;
  weeklyFirstRewardPoints: number;
  reviewRewardPointsGranted: number;
  totalGrantedPoints: number;
  createdAt: Date;
  updatedAt: Date;
}

const userFeedbackSchema = new Schema<IUserFeedback>(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["bug", "rant", "demand", "praise"],
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    contact: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    images: {
      type: [String],
      default: [],
    },
    clientMeta: {
      type: Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "reviewed"],
      default: "pending",
      index: true,
    },
    reviewLevel: {
      type: String,
      enum: ["trash", "normal", "important", "critical"],
      index: true,
    },
    reviewRemark: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    reviewedBy: {
      type: String,
      trim: true,
      index: true,
    },
    reviewedAt: {
      type: Date,
      index: true,
    },
    weeklyFirstRewardGranted: {
      type: Boolean,
      default: false,
      index: true,
    },
    weeklyFirstRewardPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    reviewRewardPointsGranted: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalGrantedPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

userFeedbackSchema.index({ userId: 1, createdAt: -1 });
userFeedbackSchema.index({ createdAt: -1 });
userFeedbackSchema.index({ status: 1, createdAt: -1 });
userFeedbackSchema.index({ reviewLevel: 1, createdAt: -1 });
userFeedbackSchema.index({ status: 1, type: 1, reviewLevel: 1, createdAt: -1 });
userFeedbackSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default model<IUserFeedback>("UserFeedback", userFeedbackSchema);
