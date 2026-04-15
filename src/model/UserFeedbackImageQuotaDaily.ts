import { Document, Schema, model } from "mongoose";

export interface IUserFeedbackImageQuotaDaily extends Document {
  userId: string;
  dateKey: string;
  usedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const userFeedbackImageQuotaDailySchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    dateKey: {
      type: String,
      required: true,
      index: true,
    },
    usedCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

userFeedbackImageQuotaDailySchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export default model<IUserFeedbackImageQuotaDaily>(
  "UserFeedbackImageQuotaDaily",
  userFeedbackImageQuotaDailySchema,
);
