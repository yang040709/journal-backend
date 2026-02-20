import { Schema, model, Document } from "mongoose";
import { coverPreviewList } from "../constant/img";

export interface IUser extends Document {
  userId: string;
  quickCovers: string[];
  quickCoversUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema(
  {
    userId: {
      type: String,
      index: true,
      unique: true,
      required: true,
    },
    quickCovers: {
      type: [String],
      default: () => coverPreviewList.slice(0, 11), // 默认取前11个封面
    },
    quickCoversUpdatedAt: {
      type: Date,
      default: Date.now,
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

// 添加虚拟字段id
userSchema.virtual("id").get(function (this: any) {
  return this._id.toString();
});

export default model<IUser>("User", userSchema);
