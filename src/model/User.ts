import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  userId: string;
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

// 添加虚拟字段id
userSchema.virtual("id").get(function (this: any) {
  return this._id.toString();
});

export default model<IUser>("User", userSchema);
