import { Schema, model, Document } from "mongoose";

export const SYSTEM_CONFIG_COVERS_KEY = "system_covers";
export const SYSTEM_CONFIG_NOTE_PRESET_TAGS_KEY = "note_preset_tags";
export const SYSTEM_CONFIG_INITIAL_NOTEBOOKS_KEY = "initial_user_notebooks";

export type InitialNotebookTemplate = { title: string; coverImg: string };

export interface ISystemConfig extends Document {
  configKey: string;
  coverUrls: string[];
  /** 手帐可选预设标签（仅 configKey=note_preset_tags 使用） */
  tagNames: string[];
  /** 新用户初始手帐本模板（仅 configKey=initial_user_notebooks 使用） */
  initialNotebookTemplates: InitialNotebookTemplate[];
  /** 实际创建数量：对 i=0..count-1 取 templates[i % len] */
  initialNotebookCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const systemConfigSchema = new Schema(
  {
    configKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    coverUrls: {
      type: [String],
      default: [],
    },
    tagNames: {
      type: [String],
      default: [],
    },
    initialNotebookTemplates: {
      type: [
        {
          title: { type: String, default: "" },
          coverImg: { type: String, default: "" },
        },
      ],
      default: [],
    },
    initialNotebookCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

export default model<ISystemConfig>("SystemConfig", systemConfigSchema);
