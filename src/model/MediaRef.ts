import { Schema, model, Document } from "mongoose";

export type MediaRefHolderType = "note" | "cover";

export interface IMediaRef extends Document {
  userId: string;
  /** COS object key（手帐图为 images.key；封面为 URL 解析出的 key） */
  cosKey: string;
  holderType: MediaRefHolderType;
  /** noteId 或 customCover 子文档 id */
  holderId: string;
  url?: string;
  thumbKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const mediaRefSchema = new Schema<IMediaRef>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    cosKey: {
      type: String,
      required: true,
      trim: true,
    },
    holderType: {
      type: String,
      required: true,
      enum: ["note", "cover"],
    },
    holderId: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    thumbKey: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

mediaRefSchema.index(
  { userId: 1, cosKey: 1, holderType: 1, holderId: 1 },
  { unique: true },
);
mediaRefSchema.index({ userId: 1, cosKey: 1 });
mediaRefSchema.index({ userId: 1, holderType: 1, holderId: 1 });

const MediaRef = model<IMediaRef>("MediaRef", mediaRefSchema, "media_refs");

export default MediaRef;
