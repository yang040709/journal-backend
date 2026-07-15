import { Document, Schema, model } from "mongoose";

export interface IAdminCaptchaChallenge extends Document {
  captchaId: string;
  answerHash: string;
  expiresAt: Date;
  createdAt: Date;
}

const adminCaptchaChallengeSchema = new Schema<IAdminCaptchaChallenge>(
  {
    captchaId: { type: String, required: true, unique: true, index: true, trim: true },
    answerHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminCaptchaChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IAdminCaptchaChallenge>(
  "AdminCaptchaChallenge",
  adminCaptchaChallengeSchema,
);
