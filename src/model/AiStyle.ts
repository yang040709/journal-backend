import { Document, Schema, model } from "mongoose";

export type AiStyleCategory = "diary" | "structured" | "social";
export type AiNoteMode = "generate" | "rewrite" | "continue";

export interface IAiStyle extends Document {
  styleKey: string;
  name: string;
  subtitle: string;
  description?: string;
  category: AiStyleCategory;
  order: number;
  enabled: boolean;
  isDefault: boolean;
  isRecommended: boolean;
  version: number;
  systemPrompt: string;
  userPromptTemplate: string;
  modePrompts: Partial<Record<AiNoteMode, string>>;
  maxOutputChars?: number;
  emojiPolicy?: "forbid" | "low" | "normal";
  outputFormat?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const modePromptsSchema = new Schema(
  {
    generate: { type: String, default: "" },
    rewrite: { type: String, default: "" },
    continue: { type: String, default: "" },
  },
  { _id: false },
);

const aiStyleSchema = new Schema<IAiStyle>(
  {
    styleKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      minlength: 2,
      maxlength: 64,
    },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    subtitle: { type: String, default: "", trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    category: {
      type: String,
      enum: ["diary", "structured", "social"],
      default: "diary",
    },
    order: { type: Number, default: 100 },
    enabled: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    isRecommended: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    systemPrompt: { type: String, required: true },
    userPromptTemplate: { type: String, required: true },
    modePrompts: { type: modePromptsSchema, default: {} },
    maxOutputChars: { type: Number, min: 50, max: 4000 },
    emojiPolicy: { type: String, enum: ["forbid", "low", "normal"] },
    outputFormat: { type: String, default: "", maxlength: 200 },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true },
);

aiStyleSchema.index({ enabled: 1, order: 1, updatedAt: -1 });

export default model<IAiStyle>("AiStyle", aiStyleSchema);
