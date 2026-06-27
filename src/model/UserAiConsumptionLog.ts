import { Document, Schema, model } from "mongoose";

export type UserAiConsumptionSource = "journal" | "template";

export interface IUserAiConsumptionLog extends Document {
  userId: string;
  dateKey: string;
  source: UserAiConsumptionSource;
  mode: string;
  styleKey?: string;
  systemPrompt: string;
  userPrompt: string;
  rawOutputText: string;
  outputText: string;
  createdAt: Date;
  updatedAt: Date;
}

const userAiConsumptionLogSchema = new Schema(
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
    source: {
      type: String,
      required: true,
      enum: ["journal", "template"],
      index: true,
    },
    mode: {
      type: String,
      required: true,
      trim: true,
    },
    styleKey: {
      type: String,
      trim: true,
    },
    systemPrompt: {
      type: String,
      default: "",
    },
    userPrompt: {
      type: String,
      required: true,
    },
    rawOutputText: {
      type: String,
      default: "",
    },
    outputText: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

userAiConsumptionLogSchema.index({ userId: 1, createdAt: -1 });
userAiConsumptionLogSchema.index({ createdAt: -1 });

export default model<IUserAiConsumptionLog>(
  "UserAiConsumptionLog",
  userAiConsumptionLogSchema,
);
