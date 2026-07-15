import Note from "../../model/Note";
import {
  formatInstantAsDateKey,
  getDateKeyByTimezone,
} from "../../utils/dateKey";
import { toLeanNoteArray } from "../../utils/typeUtils";
import {
  queueContentPreviewBackfill,
  toLeanNoteListItems,
} from "../../utils/noteListItem";
import {
  OnThisDayResult,
  OnThisDayGroup,
  sanitizeIanaTimeZone,
  isValidMonthDay as sharedIsValidMonthDay,
} from "./note.shared";

export class NoteInsightsService {
  /**
   * 按用户时区的日历日统计「创建」手帐篇数（未删除），供客户端月度热力图。
   * 依赖 MongoDB $dateToString 的 timezone；非法时区会回退为 UTC 重试。
   */
  static async getCalendarDailyCounts(
    userId: string,
    startTime: number,
    endTime: number,
    timeZone: string,
  ): Promise<{
    days: { date: string; count: number }[];
    maxCount: number;
    tz: string;
  }> {
    const tz = sanitizeIanaTimeZone(timeZone);
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("时间参数无效");
    }
    if (end.getTime() < start.getTime()) {
      throw new Error("结束时间不能早于开始时间");
    }
    const maxSpanMs = 45 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > maxSpanMs) {
      throw new Error("时间范围过大");
    }

    const baseMatch = {
      userId,
      isDeleted: { $ne: true },
      createdAt: { $gte: start, $lte: end },
    };

    const pipelineForTz = (zone: string) => [
      { $match: baseMatch },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: zone },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 as const } },
    ];

    let appliedTz = tz;
    let rows: { _id: string; count: number }[];
    try {
      rows = await Note.aggregate(pipelineForTz(tz));
    } catch {
      appliedTz = "UTC";
      rows = await Note.aggregate(pipelineForTz("UTC"));
    }

    const days = rows.map((r) => ({ date: r._id, count: r.count }));
    const maxCount = days.reduce((m, d) => Math.max(m, d.count), 0);
    return { days, maxCount, tz: appliedTz };
  }

  /** 校验月-日是否合法（2/29 仅在闰年有效） */
  static isValidMonthDay(month: number, day: number): boolean {
    return sharedIsValidMonthDay(month, day);
  }

  /**
   * 按用户时区的「月-日」聚合手帐（createdAt，未删除），供「时光回顾 / 历史上的今天」。
   */
  static async getNotesOnThisDay(
    userId: string,
    month: number,
    day: number,
    timeZone: string,
    limit: number,
  ): Promise<OnThisDayResult> {
    const tz = sanitizeIanaTimeZone(timeZone);
    const label = `${month}月${day}日`;
    const emptyResult = (appliedTz: string): OnThisDayResult => ({
      anchor: { month, day, label },
      tz: appliedTz,
      groups: [],
      total: 0,
      totalMatched: 0,
      truncated: false,
    });

    if (!NoteInsightsService.isValidMonthDay(month, day)) {
      return emptyResult(tz);
    }

    const pipelineForTz = (zone: string) => [
      { $match: { userId, isDeleted: { $ne: true } } },
      {
        $addFields: {
          dateParts: { $dateToParts: { date: "$createdAt", timezone: zone } },
        },
      },
      {
        $match: {
          "dateParts.month": month,
          "dateParts.day": day,
        },
      },
      {
        $facet: {
          meta: [{ $count: "count" }],
          items: [
            { $sort: { createdAt: -1 as const } },
            { $limit: limit },
            { $project: { dateParts: 0 } },
          ],
        },
      },
    ];

    let appliedTz = tz;
    let facetRow: { meta?: { count: number }[]; items?: Record<string, unknown>[] };
    try {
      [facetRow] = await Note.aggregate(pipelineForTz(tz));
    } catch {
      appliedTz = "UTC";
      [facetRow] = await Note.aggregate(pipelineForTz("UTC"));
    }

    const anchorYear =
      Number(getDateKeyByTimezone(appliedTz).split("-")[0]) ||
      new Date().getFullYear();

    const totalMatched = facetRow?.meta?.[0]?.count ?? 0;
    const rows = facetRow?.items ?? [];
    queueContentPreviewBackfill(rows as never[]);
    const items = toLeanNoteListItems(rows as never[]);
    const yearMap = new Map<number, typeof items>();

    for (const item of items) {
      const raw = item.createdAt;
      const createdAt =
        raw instanceof Date ? raw : new Date(raw as string | number);
      const dateKey = formatInstantAsDateKey(createdAt, appliedTz);
      const year = Number(dateKey.split("-")[0]);
      if (!year) continue;
      const bucket = yearMap.get(year);
      if (bucket) bucket.push(item);
      else yearMap.set(year, [item]);
    }

    const groups: OnThisDayGroup[] = Array.from(yearMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, groupItems]) => ({
        year,
        yearsAgo: anchorYear - year,
        items: groupItems,
      }));

    return {
      anchor: { month, day, label },
      tz: appliedTz,
      groups,
      total: items.length,
      totalMatched,
      truncated: totalMatched > items.length,
    };
  }
}
