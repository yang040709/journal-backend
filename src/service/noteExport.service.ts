import Note from "../model/Note";
import NoteExportLog from "../model/NoteExportLog";
import User from "../model/User";
import { NoteBookService } from "./noteBook.service";
import { NoteExportSettingsService } from "./noteExportSettings.service";
import { getQuotaDateContext } from "../utils/dateKey";
import { getZonedWeekRangeUtc } from "../utils/weekBounds";

export class NoteExportQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteExportQuotaError";
  }
}

export type NoteExportSort = "updatedAt" | "createdAt";

export type NoteExportPreviewResult = {
  totalInRange: number;
  wouldExport: number;
  truncated: boolean;
};

export type NoteExportRow = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  noteBookTitle: string;
};

export type NoteExportRunResult = NoteExportPreviewResult & {
  items: NoteExportRow[];
  source: "weekly_free" | "points_purchase";
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function assertFiniteMs(name: string, v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new NoteExportQuotaError(`${name} 无效`);
  }
  return Math.floor(n);
}

export class NoteExportService {
  private static resolveTimeRange(
    startMs: number | undefined,
    endMs: number | undefined,
    settings: Awaited<ReturnType<typeof NoteExportSettingsService.get>>,
  ): { start: Date; end: Date } {
    const now = Date.now();
    let end = endMs != null ? assertFiniteMs("endTime", endMs) : now;
    if (end > now) end = now;
    let start: number;
    if (startMs != null) {
      start = assertFiniteMs("startTime", startMs);
    } else {
      start = end - settings.exportDefaultWindowDays * MS_PER_DAY;
    }
    if (start > end) {
      throw new NoteExportQuotaError("开始时间不能晚于结束时间");
    }
    const spanDays = (end - start) / MS_PER_DAY;
    if (spanDays > settings.exportMaxRangeDays) {
      throw new NoteExportQuotaError(`时间跨度不能超过 ${settings.exportMaxRangeDays} 天`);
    }
    return { start: new Date(start), end: new Date(end) };
  }

  private static buildNoteFilter(
    userId: string,
    noteBookId: string,
    start: Date,
    end: Date,
    sortField: NoteExportSort,
  ): Record<string, unknown> {
    return {
      userId,
      noteBookId,
      isDeleted: { $ne: true },
      [sortField]: { $gte: start, $lte: end },
    };
  }

  static async preview(
    userId: string,
    noteBookId: string,
    startMs: number | undefined,
    endMs: number | undefined,
    sort: NoteExportSort,
  ): Promise<NoteExportPreviewResult> {
    const settings = await NoteExportSettingsService.get();
    const { start, end } = NoteExportService.resolveTimeRange(startMs, endMs, settings);
    const nb = await NoteBookService.getNoteBookById(noteBookId, userId);
    if (!nb) {
      throw new NoteExportQuotaError("手帐本不存在");
    }
    const filter = NoteExportService.buildNoteFilter(userId, noteBookId, start, end, sort);
    const totalInRange = await Note.countDocuments(filter);
    const cap = settings.exportMaxNotesPerFile;
    const truncated = totalInRange > cap;
    const wouldExport = Math.min(totalInRange, cap);
    return { totalInRange, wouldExport, truncated };
  }

  static async run(
    userId: string,
    input: {
      noteBookId: string;
      startTime?: number;
      endTime?: number;
      sort: NoteExportSort;
      clientPlatform?: string;
    },
  ): Promise<NoteExportRunResult> {
    const settings = await NoteExportSettingsService.get();
    const { start, end } = NoteExportService.resolveTimeRange(
      input.startTime,
      input.endTime,
      settings,
    );
    const sort = input.sort === "createdAt" ? "createdAt" : "updatedAt";

    const nb = await NoteBookService.getNoteBookById(input.noteBookId, userId);
    if (!nb) {
      throw new NoteExportQuotaError("手帐本不存在");
    }
    const noteBookTitle = String(nb.title || "").trim() || "未命名手帐本";

    const { timezone } = getQuotaDateContext();
    const { weekStartUtc, weekEndExclusiveUtc } = getZonedWeekRangeUtc(new Date(), timezone);

    const freeUsed = await NoteExportLog.countDocuments({
      userId,
      source: "weekly_free",
      createdAt: { $gte: weekStartUtc, $lt: weekEndExclusiveUtc },
    });

    let source: "weekly_free" | "points_purchase";
    if (freeUsed < settings.exportWeeklyFreeCount) {
      source = "weekly_free";
    } else {
      const dec = await User.findOneAndUpdate(
        { userId, exportExtraCredits: { $gte: 1 } },
        { $inc: { exportExtraCredits: -1 } },
        { new: true },
      ).lean();
      if (!dec) {
        throw new NoteExportQuotaError("本周免费次数已用完，且没有可用的额外导出次数，请用积分兑换");
      }
      source = "points_purchase";
    }

    const filter = NoteExportService.buildNoteFilter(userId, input.noteBookId, start, end, sort);
    const totalInRange = await Note.countDocuments(filter);
    const cap = settings.exportMaxNotesPerFile;
    const truncated = totalInRange > cap;
    const limit = Math.min(totalInRange, cap);

    const rows = await Note.find(filter)
      .sort({ [sort]: -1 })
      .limit(limit)
      .select("title content tags createdAt updatedAt")
      .lean();

    const items: NoteExportRow[] = rows.map((r) => {
      const title = String(r.title ?? "");
      const content = String(r.content ?? "");
      const tags = Array.isArray(r.tags) ? r.tags.map(String) : [];
      const wc = title.length + content.length;
      return {
        id: String((r as { _id?: unknown })._id ?? ""),
        title,
        content,
        tags,
        wordCount: wc,
        createdAt: (r.createdAt as Date)?.toISOString?.() ?? "",
        updatedAt: (r.updatedAt as Date)?.toISOString?.() ?? "",
        noteBookTitle,
      };
    });

    await NoteExportLog.create({
      userId,
      noteBookId: input.noteBookId,
      noteBookTitle,
      rangeStart: start,
      rangeEnd: end,
      sort,
      totalInRange,
      truncated,
      noteCount: items.length,
      source,
      clientPlatform: input.clientPlatform?.trim() || undefined,
    });

    return {
      totalInRange,
      wouldExport: items.length,
      truncated,
      items,
      source,
    };
  }
}
