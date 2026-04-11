import { Document, Schema, model } from "mongoose";

export type AdminGalleryBiz = "system_cover";

export interface IAdminGalleryImage extends Document {
  url: string;
  thumbUrl?: string;
  thumbKey?: string;
  storageKey: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  width: number;
  height: number;
  biz: AdminGalleryBiz;
  createdByAdminId: string;
  createdByAdminUsername?: string;
  createdAt: Date;
  updatedAt: Date;
}

const adminGalleryImageSchema = new Schema<IAdminGalleryImage>(
  {
    url: { type: String, required: true, trim: true },
    thumbUrl: { type: String, trim: true },
    thumbKey: { type: String, trim: true },
    storageKey: { type: String, required: true, trim: true },
    mimeType: {
      type: String,
      required: true,
      enum: ["image/jpeg", "image/png", "image/webp"],
    },
    size: { type: Number, default: 0, min: 0 },
    width: { type: Number, default: 0, min: 0 },
    height: { type: Number, default: 0, min: 0 },
    biz: {
      type: String,
      required: true,
      enum: ["system_cover"],
      default: "system_cover",
    },
    createdByAdminId: { type: String, required: true, trim: true, index: true },
    createdByAdminUsername: { type: String, trim: true },
  },
  { timestamps: true },
);

adminGalleryImageSchema.index({ storageKey: 1 }, { unique: true });
adminGalleryImageSchema.index({ biz: 1, createdAt: -1 });

const AdminGalleryImage = model<IAdminGalleryImage>(
  "AdminGalleryImage",
  adminGalleryImageSchema,
  "admin_gallery_images",
);

export default AdminGalleryImage;
