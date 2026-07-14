import { Schema, model, Document } from "mongoose";

export interface IUserAdDailyCounter extends Document {
  userId: string;
  dateKey: string;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const userAdDailyCounterSchema = new Schema<IUserAdDailyCounter>(
  {
    userId: { type: String, required: true, trim: true, index: true },
    dateKey: { type: String, required: true, trim: true },
    count: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

userAdDailyCounterSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export default model<IUserAdDailyCounter>("UserAdDailyCounter", userAdDailyCounterSchema);
