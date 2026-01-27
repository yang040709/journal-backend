import { Schema, model, Document } from "mongoose";
import { LeanTemplate } from "../types/mongoose";

export interface ITemplate extends Document {
  userId: string;
  name: string;
  description: string;
  fields: {
    title: string;
    content: string;
    tags: string[];
  };
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const templateSchema = new Schema(
  {
    userId: {
      type: String,
      required: [true, "用户ID不能为空"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "模板名称不能为空"],
      trim: true,
      maxlength: [100, "模板名称不能超过100个字符"],
    },
    description: {
      type: String,
      default: "",
      maxlength: [500, "模板描述不能超过500个字符"],
    },
    fields: {
      title: {
        type: String,
        required: [true, "标题模板不能为空"],
        trim: true,
        maxlength: [200, "标题模板不能超过200个字符"],
      },
      content: {
        type: String,
        required: [true, "内容模板不能为空"],
        default: "",
      },
      tags: {
        type: [String],
        default: [],
      },
    },
    isSystem: {
      type: Boolean,
      default: false,
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
templateSchema.index({ userId: 1, createdAt: -1 });
templateSchema.index({ userId: 1, updatedAt: -1 });
templateSchema.index({ isSystem: 1 });
templateSchema.index({ name: "text", description: "text" });

// 添加虚拟字段id
templateSchema.virtual("id").get(function (this: any) {
  return this._id.toString();
});

export default model<ITemplate>("Template", templateSchema);
export type { LeanTemplate };
