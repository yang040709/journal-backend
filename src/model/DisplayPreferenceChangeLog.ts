import { Schema, model, Document } from "mongoose";

export interface IDisplayPreferenceChangeLog extends Document {
  userId: string;
  settingKey: string;
  value: boolean | string;
  createdAt: Date;
}

const displayPreferenceChangeLogSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    settingKey: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

displayPreferenceChangeLogSchema.index({ settingKey: 1, createdAt: -1 });
displayPreferenceChangeLogSchema.index({ userId: 1, settingKey: 1 });

export default model<IDisplayPreferenceChangeLog>(
  "DisplayPreferenceChangeLog",
  displayPreferenceChangeLogSchema,
);
