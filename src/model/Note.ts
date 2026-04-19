import { Schema, model, Document } from "mongoose";
import { LeanNote } from "../types/mongoose";

export interface INote extends Document {
  noteBookId: string;
  title: string;
  content: string;
  tags: string[];
  images: INoteImage[];
  userId: string;
  isShare: boolean;
  shareId?: string;
  /** 分享版本号：每次开启分享递增，用于异步风控回写幂等 */
  shareVersion: number;
  /** 创建时若来自系统模板，记录 Template.systemKey（运营统计用） */
  appliedSystemTemplateKey?: string;
  /** 首次开启分享时间（运营按日统计用） */
  firstSharedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date | null;
  deleteExpireAt?: Date | null;
  /** 收藏（全局） */
  isFavorite: boolean;
  favoritedAt?: Date | null;
  /** 置顶（仅当前 noteBookId 内列表排序） */
  isPinned: boolean;
  pinnedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface INoteImage {
  url: string;
  key: string;
  /** 列表/网格用缩略图 COS 公网 URL（可选，旧数据无） */
  thumbUrl?: string;
  /** 缩略图对象键，与 thumbUrl 成对出现 */
  thumbKey?: string;
  width: number;
  height: number;
  size: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  createdAt?: Date;
}

const noteImageSchema = new Schema<INoteImage>(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
    },
    thumbUrl: {
      type: String,
      trim: true,
    },
    thumbKey: {
      type: String,
      trim: true,
    },
    width: {
      type: Number,
      required: true,
      min: 0,
    },
    height: {
      type: Number,
      required: true,
      min: 0,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    mimeType: {
      type: String,
      required: true,
      enum: ["image/jpeg", "image/png", "image/webp"],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const noteSchema = new Schema(
  {
    noteBookId: {
      type: String,
      required: [true, "手帐本ID不能为空"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "手帐标题不能为空"],
      trim: true,
      maxlength: [200, "手帐标题不能超过200个字符"],
    },
    content: {
      type: String,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    images: {
      type: [noteImageSchema],
      default: [],
    },
    userId: {
      type: String,
      required: [true, "用户ID不能为空"],
      index: true,
    },
    isShare: {
      type: Boolean,
      default: false,
      index: true,
    },
    shareId: {
      type: String,
      unique: true,
      sparse: true, // 允许null值存在多个
      index: true,
    },
    shareVersion: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    appliedSystemTemplateKey: {
      type: String,
      trim: true,
      maxlength: 120,
      sparse: true,
      index: true,
    },
    firstSharedAt: {
      type: Date,
      sparse: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      sparse: true,
    },
    deleteExpireAt: {
      type: Date,
      default: null,
      sparse: true,
      index: true,
    },
    isFavorite: {
      type: Boolean,
      default: false,
      index: true,
    },
    favoritedAt: {
      type: Date,
      default: null,
      sparse: true,
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    pinnedAt: {
      type: Date,
      default: null,
      sparse: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  },
);

// 创建索引
noteSchema.index({ userId: 1, createdAt: -1 });
noteSchema.index({ userId: 1, updatedAt: -1 });
noteSchema.index({ userId: 1, isDeleted: 1, updatedAt: -1 });
noteSchema.index({ userId: 1, isDeleted: 1, deleteExpireAt: 1 });
noteSchema.index({ noteBookId: 1, createdAt: -1 });
noteSchema.index({ noteBookId: 1, updatedAt: -1 });
noteSchema.index({ isShare: 1, createdAt: -1 });
noteSchema.index({ title: "text", content: "text" });
noteSchema.index({ userId: 1, isFavorite: 1, favoritedAt: -1 });
noteSchema.index({ userId: 1, noteBookId: 1, isPinned: -1, pinnedAt: -1 });
noteSchema.index({ userId: 1, noteBookId: 1, updatedAt: -1 });
noteSchema.index({ userId: 1, noteBookId: 1, createdAt: -1 });

// 添加虚拟字段id
noteSchema.virtual("id").get(function (this: any) {
  return this._id.toString();
});

export default model<INote>("Note", noteSchema);
export type { LeanNote };
