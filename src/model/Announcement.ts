import { Document, Schema, model } from "mongoose";

export type AnnouncementStatus = "draft" | "published" | "offline";

export interface IAnnouncement extends Document {
  title: string;
  content: string;
  images: string[];
  priority: number;
  showViewCount: boolean;
  viewCount: number;
  status: AnnouncementStatus;
  publishedAt?: Date | null;
  offlineAt?: Date | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20000,
    },
    images: {
      type: [String],
      default: [],
    },
    priority: {
      type: Number,
      default: 0,
      index: true,
    },
    showViewCount: {
      type: Boolean,
      default: true,
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["draft", "published", "offline"],
      default: "draft",
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
    offlineAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: String,
      trim: true,
      default: "",
    },
    updatedBy: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

announcementSchema.index({ status: 1, priority: -1, publishedAt: -1, _id: -1 });
announcementSchema.index({ updatedAt: -1 });

export default model<IAnnouncement>("Announcement", announcementSchema);
