import { Schema, model, Document } from "mongoose";

export type AdminRole = "super" | "admin";

export interface IAdmin extends Document {
  username: string;
  passwordHash: string;
  role: AdminRole;
  /** 普通管理员可访问的一级页面 key；超级管理员忽略此字段 */
  allowedPages: string[];
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const adminSchema = new Schema<IAdmin>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 2,
      maxlength: 64,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["super", "admin"],
      required: true,
    },
    allowedPages: {
      type: [String],
      default: [],
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

adminSchema.virtual("id").get(function (this: { _id: { toString: () => string } }) {
  return this._id.toString();
});

export default model<IAdmin>("Admin", adminSchema);
