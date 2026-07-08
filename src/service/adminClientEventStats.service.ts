import ClientEvent from "../model/ClientEvent";
import {
  CLIENT_EVENT_NAMES,
  getClientEventActionLabel,
  getClientEventLabel,
  isClientEventName,
  ME_MENU_SECTION_LABELS,
  type MeMenuSection,
} from "../constant/clientEvent";
import { CACHE_CONFIG } from "../config/cache";
import {
  buildCacheKey,
  getOrSetCache,
  invalidateCacheByPrefix,
} from "../utils/cache";

const STATS_TIMEZONE = process.env.UPLOAD_QUOTA_TIMEZONE || "Asia/Shanghai";
const DEFAULT_DAYS = 7;
export const MAX_CLIENT_EVENT_STATS_DAYS = 90;

const CLIENT_EVENT_STATS_CACHE_PREFIX = buildCacheKey(
  "stats",
  "v1",
  "admin",
  "client-events",
);

export interface AdminClientEventStatsQuery {
  days?: number;
  eventName?: string;
}

export interface ClientEventSummaryStat {
  eventName: string;
  eventLabel: string;
  count: number;
  uniqueUsers: number;
}

export interface ClientEventActionStat {
  eventName: string;
  eventLabel: string;
  action: string;
  actionLabel: string;
  section?: string;
  sectionLabel?: string;
  itemId?: string;
  mode?: string;
  count: number;
  uniqueUsers: number;
}

export interface ClientEventDailyStat {
  date: string;
  count: number;
}

export interface ClientEventPlatformStat {
  platform: string;
  count: number;
}

export interface AdminClientEventStatsReport {
  generatedAt: string;
  days: number;
  startAt: string;
  endAt: string;
  totalEvents: number;
  uniqueUsers: number;
  eventSummary: ClientEventSummaryStat[];
  actionStats: ClientEventActionStat[];
  dailyTrend: ClientEventDailyStat[];
  platformStats: ClientEventPlatformStat[];
}

function normalizeDays(days?: number): number {
  if (!Number.isFinite(days)) return DEFAULT_DAYS;
  return Math.min(MAX_CLIENT_EVENT_STATS_DAYS, Math.max(1, Math.floor(days as number)));
}

function buildDateRange(days: number): { startAt: Date; endAt: Date } {
  const endAt = new Date();
  const startAt = new Date(endAt.getTime() - days * 24 * 60 * 60 * 1000);
  return { startAt, endAt };
}

function buildMatchFilter(
  startAt: Date,
  endAt: Date,
  eventName?: string,
): Record<string, unknown> {
  const match: Record<string, unknown> = {
    serverTs: { $gte: startAt, $lte: endAt },
  };
  if (eventName && isClientEventName(eventName)) {
    match.eventName = eventName;
  }
  return match;
}

export class AdminClientEventStatsService {
  static invalidateReportCache(): void {
    invalidateCacheByPrefix(CLIENT_EVENT_STATS_CACHE_PREFIX);
  }

  static async getReport(
    query: AdminClientEventStatsQuery = {},
  ): Promise<AdminClientEventStatsReport> {
    const days = normalizeDays(query.days);
    const eventName = query.eventName?.trim() || "";
    const cacheKey = buildCacheKey(
      CLIENT_EVENT_STATS_CACHE_PREFIX,
      String(days),
      eventName || "all",
    );

    return getOrSetCache(
      cacheKey,
      CACHE_CONFIG.admin.clientEventStatsTtlSeconds,
      () => AdminClientEventStatsService.buildReport(days, eventName || undefined),
    );
  }

  private static async buildReport(
    days: number,
    eventName?: string,
  ): Promise<AdminClientEventStatsReport> {
    const { startAt, endAt } = buildDateRange(days);
    const match = buildMatchFilter(startAt, endAt, eventName);

    const [
      totalAgg,
      eventSummaryAgg,
      actionAgg,
      dailyAgg,
      platformAgg,
    ] = await Promise.all([
      ClientEvent.aggregate<{
        totalEvents: number;
        users: string[];
      }>([
        { $match: match },
        {
          $group: {
            _id: null,
            totalEvents: { $sum: 1 },
            users: { $addToSet: "$userId" },
          },
        },
      ]),
      ClientEvent.aggregate<{
        _id: string;
        count: number;
        users: string[];
      }>([
        { $match: match },
        {
          $group: {
            _id: "$eventName",
            count: { $sum: 1 },
            users: { $addToSet: "$userId" },
          },
        },
        { $sort: { count: -1 } },
      ]),
      ClientEvent.aggregate<{
        _id: {
          eventName: string;
          action: string;
          section?: string;
          itemId?: string;
          mode?: string;
        };
        count: number;
        users: string[];
      }>([
        { $match: match },
        {
          $group: {
            _id: {
              eventName: "$eventName",
              action: "$props.action",
              section: "$props.section",
              itemId: "$props.itemId",
              mode: "$props.mode",
            },
            count: { $sum: 1 },
            users: { $addToSet: "$userId" },
          },
        },
        { $sort: { count: -1 } },
      ]),
      ClientEvent.aggregate<{
        _id: string;
        count: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$serverTs",
                timezone: STATS_TIMEZONE,
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      ClientEvent.aggregate<{
        _id: string;
        count: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: "$platform",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
    ]);

    const totalRow = totalAgg[0];
    const totalEvents = totalRow?.totalEvents ?? 0;
    const uniqueUsers = totalRow?.users?.length ?? 0;

    const eventSummary: ClientEventSummaryStat[] = eventSummaryAgg.map((row) => ({
      eventName: row._id,
      eventLabel: getClientEventLabel(row._id),
      count: row.count,
      uniqueUsers: row.users?.length ?? 0,
    }));

    const actionStats: ClientEventActionStat[] = actionAgg.map((row) => {
      const action = String(row._id.action ?? "");
      const section = row._id.section ? String(row._id.section) : undefined;
      const itemId = row._id.itemId ? String(row._id.itemId) : undefined;
      const mode = row._id.mode ? String(row._id.mode) : undefined;
      const event = String(row._id.eventName ?? "");

      return {
        eventName: event,
        eventLabel: getClientEventLabel(event),
        action,
        actionLabel: getClientEventActionLabel(event, action, {
          section,
          itemId,
          mode,
        }),
        section,
        sectionLabel:
          section && section in ME_MENU_SECTION_LABELS
            ? ME_MENU_SECTION_LABELS[section as MeMenuSection]
            : section,
        itemId,
        mode,
        count: row.count,
        uniqueUsers: row.users?.length ?? 0,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      days,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      totalEvents,
      uniqueUsers,
      eventSummary,
      actionStats,
      dailyTrend: dailyAgg.map((row) => ({
        date: row._id,
        count: row.count,
      })),
      platformStats: platformAgg.map((row) => ({
        platform: row._id || "unknown",
        count: row.count,
      })),
    };
  }
}
