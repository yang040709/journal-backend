import { Schema, model, Document } from "mongoose";
import { LeanNote } from "../types/mongoose";

export interface INote extends Document {
  noteBookId: string;
  title: string;
  content: string;
  tags: string[];
  userId: string;
  isShare: boolean;
  shareId?: string;
  createdAt: Date;
  updatedAt: Date;
}

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
noteSchema.index({ noteBookId: 1, createdAt: -1 });
noteSchema.index({ noteBookId: 1, updatedAt: -1 });
noteSchema.index({ tags: 1 });
noteSchema.index({ title: "text", content: "text" });

// 添加虚拟字段id
noteSchema.virtual("id").get(function (this: any) {
  return this._id.toString();
});

export default model<INote>("Note", noteSchema);
export type { LeanNote };
