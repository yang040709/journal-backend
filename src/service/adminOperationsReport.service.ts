import Note from "../model/Note";
import NoteBook from "../model/NoteBook";
import User from "../model/User";
import Template from "../model/Template";
import Reminder from "../model/Reminder";
import UserUploadQuotaDaily from "../model/UserUploadQuotaDaily";
import UserAiUsageDaily from "../model/UserAiUsageDaily";
import { InitialUserNotebookConfigService } from "./initialUserNotebookConfig.service";
import { getQuotaDateContext } from "../utils/dateKey";
import {
  enumerateZonedYmdInclusive,
  zonedRangeUtcBounds,
} from "../utils/zonedDayBounds";
import { CoverService } from "./cover.service";
import { CACHE_CONFIG } from "../config/cache";
import { buildCacheKey, getOrSetCache } from "../utils/cache";

export const MAX_RANGE_DAYS = 730;

export type DailyPoint = { date: string; count: number };
export type NamedCount = { name: string; count: number };
export type UserRankRow = { userId: string; count: number };
export type HourPoint = { hour: number; count: number };

function fillDaily(
  keys: string[],
  byDay: Map<string, number>,
): DailyPoint[] {
  return keys.map((date) => ({ date, count: byDay.get(date) ?? 0 }));
}

function ymdRegex(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function daySpanInclusive(startYmd: string, endYmd: string): number {
  const a = new Date(startYmd + "T12:00:00Z").getTime();
  const b = new Date(endYmd + "T12:00:00Z").getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

export class AdminOperationsReportService {
  static validateRange(startDate: string, endDate: string, tz: string): void {
    if (!ymdRegex(startDate) || !ymdRegex(endDate)) {
      throw new Error("startDate/endDate 须为 YYYY-MM-DD");
    }
    if (startDate > endDate) {
      throw new Error("开始日期不能晚于结束日期");
    }
    const days = daySpanInclusive(startDate, endDate);
    if (days > MAX_RANGE_DAYS) {
      throw new Error(`时间跨度不能超过 ${MAX_RANGE_DAYS} 天`);
    }
    zonedRangeUtcBounds(startDate, endDate, tz);
  }

  static async getReport(startDate: string, endDate: string) {
    const { timezone: tz } = getQuotaDateContext();
    AdminOperationsReportService.validateRange(startDate, endDate, tz);
    const cacheKey = buildCacheKey(
      "stats",
      "v1",
      "admin",
      "operations-report",
      { startDate, endDate, tz },
    );

    return getOrSetCache(cacheKey, CACHE_CONFIG.admin.operationsReportTtlSeconds, async () => {
      const { fromInclusive, toExclusive } = zonedRangeUtcBounds(
        startDate,
        endDate,
        tz,
      );
      const dayKeys = enumerateZonedYmdInclusive(startDate, endDate, tz);

      const systemCovers = await CoverService.getSystemCovers();
      const systemCoverSet = new Set(systemCovers);
      const excludedNotebookTitles =
        await InitialUserNotebookConfigService.getExcludedNotebookTitles();

      const dateMatch = { $gte: fromInclusive, $lt: toExclusive };

    const [
      tagAgg,
      templateKeyAgg,
      newUsersAgg,
      newNotesAgg,
      firstShareAgg,
      notebooksCreatedAgg,
      distinctCreatorsAgg,
      notesWithImagesAgg,
      userTemplatesAgg,
      remindersCreatedAgg,
      remindersSentAgg,
      aiTotalsAgg,
      uploadTotalsAgg,
      hourAgg,
      topNotebooksAgg,
      topUploadAgg,
      topAiAgg,
      notebookCoverAgg,
    ] = await Promise.all([
      Note.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            createdAt: dateMatch,
            tags: { $exists: true, $ne: [] },
          },
        },
        { $unwind: "$tags" },
        { $match: { tags: { $nin: [null, ""] } } },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 200 },
      ]),
      Note.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            createdAt: dateMatch,
            appliedSystemTemplateKey: { $exists: true, $gt: "" },
          },
        },
        { $group: { _id: "$appliedSystemTemplateKey", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      User.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: dateMatch } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: tz,
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Note.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: dateMatch } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: tz,
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Note.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            firstSharedAt: { $gte: fromInclusive, $lt: toExclusive },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$firstSharedAt",
                timezone: tz,
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      NoteBook.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: dateMatch } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: tz,
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Note.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: dateMatch } },
        {
          $group: {
            _id: {
              d: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                  timezone: tz,
                },
              },
              u: "$userId",
            },
          },
        },
        { $group: { _id: "$_id.d", count: { $sum: 1 } } },
      ]),
      Note.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            createdAt: dateMatch,
            "images.0": { $exists: true },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: tz,
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Template.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            isSystem: false,
            createdAt: dateMatch,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: tz,
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Reminder.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: dateMatch } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: tz,
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Reminder.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            sendStatus: "sent",
            sentAt: { $gte: fromInclusive, $lt: toExclusive },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$sentAt",
                timezone: tz,
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      UserAiUsageDaily.aggregate<{ _id: string; total: number }>([
        {
          $match: {
            dateKey: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: "$dateKey",
            total: { $sum: "$usedCount" },
          },
        },
      ]),
      UserUploadQuotaDaily.aggregate<{ _id: string; total: number }>([
        {
          $match: {
            dateKey: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: "$dateKey",
            total: { $sum: "$bizBreakdown.note" },
          },
        },
      ]),
      Note.aggregate<{ _id: number; count: number }>([
        { $match: { createdAt: dateMatch } },
        {
          $group: {
            _id: { $hour: { date: "$createdAt", timezone: tz } },
            count: { $sum: 1 },
          },
        },
      ]),
      Note.aggregate<{ title: string; noteCount: number }>([
        { $match: { createdAt: dateMatch } },
        {
          $addFields: {
            noteBookObjId: {
              $convert: {
                input: "$noteBookId",
                to: "objectId",
                onError: null,
                onNull: null,
              },
            },
          },
        },
        {
          $lookup: {
            from: NoteBook.collection.collectionName,
            localField: "noteBookObjId",
            foreignField: "_id",
            as: "nb",
          },
        },
        { $unwind: { path: "$nb", preserveNullAndEmptyArrays: false } },
        { $group: { _id: "$nb.title", noteCount: { $sum: 1 } } },
        {
          $match: {
            _id: { $nin: [...excludedNotebookTitles] },
          },
        },
        { $sort: { noteCount: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, title: "$_id", noteCount: 1 } },
      ]),
      UserUploadQuotaDaily.aggregate<{ _id: string; total: number }>([
        {
          $match: {
            dateKey: { $gte: startDate, $lte: endDate },
          },
        },
        { $group: { _id: "$userId", total: { $sum: "$bizBreakdown.note" } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
      UserAiUsageDaily.aggregate<{ _id: string; total: number }>([
        {
          $match: {
            dateKey: { $gte: startDate, $lte: endDate },
          },
        },
        { $group: { _id: "$userId", total: { $sum: "$usedCount" } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
      NoteBook.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: dateMatch } },
        { $group: { _id: "$coverImg", count: { $sum: 1 } } },
      ]),
    ]);

    const toMap = (rows: { _id: string; count?: number; total?: number }[]) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const v = r.count ?? r.total ?? 0;
        m.set(r._id, v);
      }
      return m;
    };

    const newUsersByDay = toMap(newUsersAgg);
    const newNotesByDay = toMap(newNotesAgg);
    const firstShareByDay = toMap(firstShareAgg);
    const notebooksByDay = toMap(notebooksCreatedAgg);
    const creatorsByDay = toMap(distinctCreatorsAgg);
    const withImagesByDay = toMap(notesWithImagesAgg);
    const userTplByDay = toMap(userTemplatesAgg);
    const remCByDay = toMap(remindersCreatedAgg);
    const remSByDay = toMap(remindersSentAgg);
    const aiDay = new Map(aiTotalsAgg.map((r) => [r._id, r.total]));
    const uploadDay = new Map(uploadTotalsAgg.map((r) => [r._id, r.total]));

    const coverCountsRaw = new Map<string, number>();
    let nonSystemOrEmpty = 0;
    for (const row of notebookCoverAgg) {
      const url = row._id || "";
      const c = row.count;
      if (!url || !systemCoverSet.has(url)) {
        nonSystemOrEmpty += c;
      } else {
        coverCountsRaw.set(url, (coverCountsRaw.get(url) ?? 0) + c);
      }
    }

    const systemCoverUsage: NamedCount[] = systemCovers.map((url) => ({
      name: url,
      count: coverCountsRaw.get(url) ?? 0,
    }));
    systemCoverUsage.push({
      name: "非系统封面或未设置",
      count: nonSystemOrEmpty,
    });

    const templateKeys = templateKeyAgg.map((r) => r._id);
    const tplDocs = await Template.find({
      isSystem: true,
      systemKey: { $in: templateKeys },
    })
      .select({ systemKey: 1, name: 1 })
      .lean();
    const keyToName = new Map(
      tplDocs.map((t) => [String(t.systemKey || ""), String(t.name || "")]),
    );
    const systemTemplateUsage: NamedCount[] = templateKeyAgg.map((r) => ({
      name: keyToName.get(r._id) || r._id,
      count: r.count,
    }));

    const tagUsage: NamedCount[] = tagAgg.map((r) => ({
      name: r._id,
      count: r.count,
    }));

    const hourMap = new Map<number, number>();
    for (const h of hourAgg) {
      hourMap.set(h._id, h.count);
    }
    const notesByHour: HourPoint[] = [];
    for (let hour = 0; hour < 24; hour++) {
      notesByHour.push({ hour, count: hourMap.get(hour) ?? 0 });
    }

    const topNoteBookTitles: NamedCount[] = topNotebooksAgg.map((r) => ({
      name: r.title,
      count: r.noteCount,
    }));

    const topUploadUsers: UserRankRow[] = topUploadAgg.map((r) => ({
      userId: r._id,
      count: r.total,
    }));

    const topAiUsers: UserRankRow[] = topAiAgg.map((r) => ({
      userId: r._id,
      count: r.total,
    }));

      return {
        statsTimezone: tz,
        range: { startDate, endDate },
        generatedAt: new Date().toISOString(),
        systemCoverUsage,
        tagUsage,
        systemTemplateUsage,
        dailyNewUsers: fillDaily(dayKeys, newUsersByDay),
        dailyNewNotes: fillDaily(dayKeys, newNotesByDay),
        dailyFirstShareNotes: fillDaily(dayKeys, firstShareByDay),
        topNoteBookTitles,
        topUploadUsers,
        topAiUsers,
        dailyNewNoteBooks: fillDaily(dayKeys, notebooksByDay),
        dailyDistinctNoteCreators: fillDaily(dayKeys, creatorsByDay),
        dailyNotesWithImages: fillDaily(dayKeys, withImagesByDay),
        dailyAiCallsTotal: fillDaily(dayKeys, aiDay),
        dailyUploadImagesNoteTotal: fillDaily(dayKeys, uploadDay),
        dailyNewUserTemplates: fillDaily(dayKeys, userTplByDay),
        dailyRemindersCreated: fillDaily(dayKeys, remCByDay),
        dailyRemindersSent: fillDaily(dayKeys, remSByDay),
        notesByHour,
      };
    });
  }
}
