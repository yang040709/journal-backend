import User from "../model/User";
import Note from "../model/Note";
import NoteBook from "../model/NoteBook";
import Template from "../model/Template";
import Reminder from "../model/Reminder";
import { getDateKeyByTimezone, getQuotaDateContext } from "../utils/dateKey";

/** 公历日减一天（yyyy-MM-dd），用于按自然日序列对齐 */
function prevCalendarDayYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const next = new Date(t - 86400000);
  const y2 = next.getUTCFullYear();
  const m2 = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(next.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}

function nextCalendarDayYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const next = new Date(t + 86400000);
  const y2 = next.getUTCFullYear();
  const m2 = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(next.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}

/** 含端点的连续 7 个自然日（从旧到新），与 UPLOAD_QUOTA_TIMEZONE 的「今日」对齐 */
function getLast7CalendarDayKeysAscending(tz: string): string[] {
  const todayKey = getDateKeyByTimezone(tz);
  let oldest = todayKey;
  for (let i = 0; i < 6; i++) {
    oldest = prevCalendarDayYmd(oldest);
  }
  const keys: string[] = [];
  let cur = oldest;
  for (let i = 0; i < 7; i++) {
    keys.push(cur);
    cur = nextCalendarDayYmd(cur);
  }
  return keys;
}

export type OverviewDailyNote = { date: string; count: number };

export class AdminStatsService {
  static async getOverview() {
    const now = new Date();
    const { timezone: quotaTz } = getQuotaDateContext();
    const d7 = new Date(now);
    d7.setDate(d7.getDate() - 7);
    const d14 = new Date(now);
    d14.setDate(d14.getDate() - 14);
    const d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);

    const [
      userTotal,
      noteTotal,
      notebookTotal,
      newNotes7d,
      newNotes30d,
      newNotesPrev7d,
      sharedNoteTotal,
      newUsers7d,
      newUsers30d,
      templateUserTotal,
      reminderPendingTotal,
    ] = await Promise.all([
      User.countDocuments(),
      Note.countDocuments(),
      NoteBook.countDocuments(),
      Note.countDocuments({ createdAt: { $gte: d7 } }),
      Note.countDocuments({ createdAt: { $gte: d30 } }),
      Note.countDocuments({ createdAt: { $gte: d14, $lt: d7 } }),
      Note.countDocuments({ isShare: true }),
      User.countDocuments({ createdAt: { $gte: d7 } }),
      User.countDocuments({ createdAt: { $gte: d30 } }),
      Template.countDocuments({ isSystem: false }),
      Reminder.countDocuments({ sendStatus: "pending" }),
    ]);

    const newNotes7dWowPercent =
      newNotesPrev7d === 0
        ? null
        : ((newNotes7d - newNotesPrev7d) / newNotesPrev7d) * 100;

    const dayKeys = getLast7CalendarDayKeysAscending(quotaTz);
    /** 略宽于 7 日，避免边界漏数；按日桶仍用 $dateToString 时区对齐 */
    const aggMatchFrom = new Date(Date.now() - 10 * 86400000 * 1000);
    const agg = await Note.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          createdAt: {
            $gte: aggMatchFrom,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: quotaTz,
            },
          },
          count: { $sum: 1 },
        },
      },
    ]);
    const byDay = new Map(agg.map((r) => [r._id, r.count]));
    const seriesNotesLast7Days: OverviewDailyNote[] = dayKeys.map((date) => ({
      date,
      count: byDay.get(date) ?? 0,
    }));

    return {
      userTotal,
      noteTotal,
      notebookTotal,
      newNotes7d,
      newNotes30d,
      /** 再往前 7 日滚动窗口内新建手帐数，用于与 newNotes7d 环比 */
      newNotesPrev7d,
      newNotes7dWowPercent:
        newNotes7dWowPercent === null
          ? null
          : Math.round(newNotes7dWowPercent * 10) / 10,
      sharedNoteTotal,
      newUsers7d,
      newUsers30d,
      templateUserTotal,
      reminderPendingTotal,
      seriesNotesLast7Days,
      /** 与 seriesNotesLast7Days 的日界线一致（见 getQuotaDateContext） */
      statsTimezone: quotaTz,
      generatedAt: now.toISOString(),
    };
  }
}
