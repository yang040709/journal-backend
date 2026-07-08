import { Schema, model, Document } from "mongoose";
import type { ClientEventName } from "../constant/clientEvent";

export interface IClientEvent extends Document {
  eventId: string;
  eventName: ClientEventName;
  userId: string;
  clientTs: number;
  serverTs: Date;
  platform: string;
  pagePath: string;
  appVersion?: string;
  sessionId?: string;
  requestId: string;
  props: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

const clientEventSchema = new Schema<IClientEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    eventName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    clientTs: {
      type: Number,
      required: true,
      index: true,
    },
    serverTs: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    platform: {
      type: String,
      required: true,
      trim: true,
    },
    pagePath: {
      type: String,
      required: true,
      trim: true,
    },
    appVersion: {
      type: String,
      trim: true,
    },
    sessionId: {
      type: String,
      trim: true,
    },
    requestId: {
      type: String,
      required: true,
      trim: true,
    },
    props: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    ip: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: false,
    collection: "client_events",
  },
);

clientEventSchema.index({ userId: 1, clientTs: -1 });
clientEventSchema.index({ eventName: 1, clientTs: -1 });
clientEventSchema.index({ eventName: 1, "props.action": 1, clientTs: -1 });

export default model<IClientEvent>("ClientEvent", clientEventSchema);
