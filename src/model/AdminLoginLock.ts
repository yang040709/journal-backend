import { Document, Schema, model } from "mongoose";

export interface IAdminLoginLock extends Document {
  username: string;
  failStreak: number;
  lockedUntil?: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adminLoginLockSchema = new Schema<IAdminLoginLock>(
  {
    username: { type: String, required: true, unique: true, index: true, trim: true },
    failStreak: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

adminLoginLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IAdminLoginLock>("AdminLoginLock", adminLoginLockSchema);
