import ClientEvent from "../model/ClientEvent";
import {
  isClientEventName,
  isClientEventTrackingAllowed,
  sanitizeClientEventProps,
  type ClientEventName,
} from "../constant/clientEvent";
import { ClientEventConfigService } from "./clientEventConfig.service";
import logger from "../utils/logger";

export interface ClientEventInput {
  eventId: string;
  eventName: string;
  clientTs: number;
  platform: string;
  pagePath: string;
  appVersion?: string;
  sessionId?: string;
  props?: Record<string, unknown>;
}

export interface IngestBatchResult {
  accepted: number;
  duplicated: number;
  rejected: number;
}

export class ClientEventService {
  static async ingestBatch(params: {
    userId: string;
    requestId: string;
    events: ClientEventInput[];
    ip?: string;
    userAgent?: string;
  }): Promise<IngestBatchResult> {
    const { userId, requestId, events, ip, userAgent } = params;
    const result: IngestBatchResult = {
      accepted: 0,
      duplicated: 0,
      rejected: 0,
    };

    const trackSettings = await ClientEventConfigService.getNormalized();

    const docs: Array<{
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
    }> = [];

    for (const item of events) {
      const eventId = String(item?.eventId || "").trim();
      const eventNameRaw = String(item?.eventName || "").trim();
      const platform = String(item?.platform || "").trim();
      const pagePath = String(item?.pagePath || "").trim();
      const clientTs = Number(item?.clientTs);

      if (
        !eventId ||
        !eventNameRaw ||
        !platform ||
        !pagePath ||
        !Number.isFinite(clientTs)
      ) {
        result.rejected += 1;
        continue;
      }

      if (!isClientEventName(eventNameRaw)) {
        logger.warn("[clientEvent] rejected invalid eventName", {
          eventName: eventNameRaw,
          eventId,
        });
        result.rejected += 1;
        continue;
      }

      if (!isClientEventTrackingAllowed(trackSettings, eventNameRaw)) {
        logger.warn("[clientEvent] rejected disabled eventName", {
          eventName: eventNameRaw,
          eventId,
        });
        result.rejected += 1;
        continue;
      }

      const sanitizedProps = sanitizeClientEventProps(
        eventNameRaw,
        item.props as Record<string, unknown>,
      );
      if (!sanitizedProps) {
        logger.warn("[clientEvent] rejected invalid props", {
          eventName: eventNameRaw,
          eventId,
        });
        result.rejected += 1;
        continue;
      }

      const doc: (typeof docs)[number] = {
        eventId,
        eventName: eventNameRaw,
        userId,
        clientTs,
        serverTs: new Date(),
        platform,
        pagePath,
        requestId,
        props: sanitizedProps,
      };

      const appVersion = String(item.appVersion || "").trim();
      if (appVersion) doc.appVersion = appVersion;

      const sessionId = String(item.sessionId || "").trim();
      if (sessionId) doc.sessionId = sessionId;

      if (ip) doc.ip = ip;
      if (userAgent) doc.userAgent = userAgent;

      docs.push(doc);
    }

    if (!docs.length) {
      return result;
    }

    const eventIds = docs.map((doc) => doc.eventId);
    const existing = await ClientEvent.find({ eventId: { $in: eventIds } })
      .select("eventId")
      .lean();
    const existingIds = new Set(existing.map((item) => item.eventId));

    const toInsert = docs.filter((doc) => !existingIds.has(doc.eventId));
    result.duplicated += docs.length - toInsert.length;

    if (!toInsert.length) {
      return result;
    }

    const inserted = await ClientEvent.insertMany(toInsert, { ordered: false });
    result.accepted += inserted.length;

    return result;
  }
}
