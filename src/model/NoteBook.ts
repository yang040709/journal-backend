import { Schema, model, Document } from "mongoose";
import { LeanNoteBook } from "../types/mongoose";

export interface INoteBook extends Document {
  title: string;
  coverImg?: string;
  count: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const noteBookSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "手帐本标题不能为空"],
      trim: true,
      maxlength: [100, "手帐本标题不能超过100个字符"],
    },
    coverImg: {
      type: String,
      default: "",
    },
    count: {
      type: Number,
      default: 0,
      min: [0, "手帐数量不能小于0"],
    },
    userId: {
      type: String,
      required: [true, "用户ID不能为空"],
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
  }
);

// 创建索引
noteBookSchema.index({ userId: 1, createdAt: -1 });
noteBookSchema.index({ userId: 1, updatedAt: -1 });

// 添加虚拟字段id
noteBookSchema.virtual("id").get(function (this: any) {
  return this._id.toString();
});

export default model<INoteBook>("NoteBook", noteBookSchema);
export type { LeanNoteBook };
