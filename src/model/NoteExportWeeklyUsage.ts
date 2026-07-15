import { Schema, model, Document } from "mongoose";

export interface INoteExportWeeklyUsage extends Document {
  userId: string;
  weekKey: string;
  used: number;
  createdAt: Date;
  updatedAt: Date;
}

const noteExportWeeklyUsageSchema = new Schema<INoteExportWeeklyUsage>(
  {
    userId: { type: String, required: true, trim: true, index: true },
    weekKey: { type: String, required: true, trim: true },
    used: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

noteExportWeeklyUsageSchema.index({ userId: 1, weekKey: 1 }, { unique: true });

export default model<INoteExportWeeklyUsage>(
  "NoteExportWeeklyUsage",
  noteExportWeeklyUsageSchema,
);
