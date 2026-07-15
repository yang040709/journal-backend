import { Schema, model, Document } from "mongoose";

export type ReadingThemeChangeScope = "global" | "note";

export interface IReadingThemeChangeLog extends Document {
  userId: string;
  scope: ReadingThemeChangeScope;
  noteId?: string;
  readingStyleKey: string | null;
  readingThemeId: string | null;
  createdAt: Date;
}

const readingThemeChangeLogSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    scope: {
      type: String,
      enum: ["global", "note"],
      required: true,
      index: true,
    },
    noteId: {
      type: String,
      trim: true,
    },
    readingStyleKey: {
      type: String,
      default: null,
      trim: true,
    },
    readingThemeId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

readingThemeChangeLogSchema.index({ scope: 1, createdAt: -1 });
readingThemeChangeLogSchema.index({
  readingStyleKey: 1,
  readingThemeId: 1,
  createdAt: -1,
});
readingThemeChangeLogSchema.index({ userId: 1, createdAt: -1 });

export default model<IReadingThemeChangeLog>(
  "ReadingThemeChangeLog",
  readingThemeChangeLogSchema,
);
