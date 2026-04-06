import { Schema, model, Document } from "mongoose";

export const SYSTEM_CONFIG_COVERS_KEY = "system_covers";
export const SYSTEM_CONFIG_NOTE_PRESET_TAGS_KEY = "note_preset_tags";
export const SYSTEM_CONFIG_INITIAL_NOTEBOOKS_KEY = "initial_user_notebooks";
/** 积分规则（JSON 存于 pointsRules，见 PointsService） */
export const SYSTEM_CONFIG_POINTS_RULES_KEY = "points_rules";
/** 上传/AI 每日基础额度（JSON 存于 quotaBaseLimits） */
export const SYSTEM_CONFIG_QUOTA_BASE_LIMITS_KEY = "quota_base_limits";

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
  /** 仅 configKey=points_rules 使用：积分/广告/兑换配置 */
  pointsRules?: Record<string, unknown> | null;
  /** 仅 configKey=quota_base_limits 使用：上传/AI 每日基础额度 */
  quotaBaseLimits?: Record<string, unknown> | null;
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
    pointsRules: {
      type: Schema.Types.Mixed,
    },
    quotaBaseLimits: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);

export default model<ISystemConfig>("SystemConfig", systemConfigSchema);
