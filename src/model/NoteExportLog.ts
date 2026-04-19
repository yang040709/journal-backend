import { Schema, model, Document } from "mongoose";

export type NoteExportSource = "weekly_free" | "points_purchase";

export interface INoteExportLog extends Document {
  userId: string;
  noteBookId: string;
  noteBookTitle: string;
  rangeStart: Date;
  rangeEnd: Date;
  sort: "updatedAt" | "createdAt";
  totalInRange: number;
  truncated: boolean;
  noteCount: number;
  source: NoteExportSource;
  clientPlatform?: string;
  createdAt: Date;
  updatedAt: Date;
}

const noteExportLogSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    noteBookId: { type: String, required: true, index: true },
    noteBookTitle: { type: String, default: "" },
    rangeStart: { type: Date, required: true },
    rangeEnd: { type: Date, required: true },
    sort: { type: String, enum: ["updatedAt", "createdAt"], required: true },
    totalInRange: { type: Number, required: true, min: 0 },
    truncated: { type: Boolean, default: false },
    noteCount: { type: Number, required: true, min: 0 },
    source: {
      type: String,
      enum: ["weekly_free", "points_purchase"],
      required: true,
      index: true,
    },
    clientPlatform: { type: String, trim: true, maxlength: 32 },
  },
  { timestamps: true },
);

noteExportLogSchema.index({ userId: 1, createdAt: -1 });
noteExportLogSchema.index({ userId: 1, source: 1, createdAt: -1 });

export default model<INoteExportLog>("NoteExportLog", noteExportLogSchema);
