import NoteBook from "../model/NoteBook";
import Note from "../model/Note";
import Activity, { LeanActivity } from "../model/Activity";
import Reminder from "../model/Reminder";
import Template from "../model/Template";
import { toLeanActivityArray } from "../utils/typeUtils";

export interface UserStats {
  noteBookCount: number;
  noteCount: number;
}

export interface ActivityItem {
  type: "create" | "update" | "delete";
  target: "noteBook" | "note" | "reminder" | "template";
  targetId: string;
  title: string;
  timestamp: number;
}

export interface TagStats {
  tag: string;
  count: number;
}

export interface OverviewStats {
  notebookTotal: number;
  noteTotal: number;
  newNotes7d: number;
  newNotes30d: number;
  lastEditedAt: Date | null;
}

export interface CreationTrendStats {
  range: 7 | 30;
  dailyCreated: Array<{
    date: string;
    count: number;
  }>;
  hourlyUpdated: Array<{
    hour: number;
    count: number;
  }>;
  avgDailyCreated: number;
}

export interface TagQualityStats {
  topTags: TagStats[];
  untaggedRate: number;
  tagCoverageRate: number;
  avgTagsPerNote: number;
}

export interface NotebookHealthItem {
  notebookId: string;
  name: string;
  noteCount: number;
  lastUpdatedAt: Date | null;
  activeIn30d: boolean;
}

export interface NotebookHealthStats {
  notebooks: NotebookHealthItem[];
  emptyNotebookCount: number;
}

export interface ImageAssetStats {
  noteWithImageRate: number;
  imageTotal: number;
  avgImagesPerNote: number;
  totalImageSizeMB: number;
  formatDistribution: Array<{
    format: "jpeg" | "png" | "webp";
    count: number;
  }>;
}

export interface ReminderPerformanceStats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  successRate30d: number;
  avgRetryCount: number;
  expiredUnsent: number;
}

export interface TemplateUsageStats {
  templateTotal: number;
  systemTemplateTotal: number;
  customTemplateTotal: number;
  newTemplate30d: number;
  topUsedTemplates: Array<{
    templateId: string;
    name: string;
    usedCount: number;
  }>;
}

export class StatsService {
  private static readonly TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

  private static toUtc8DateKey(date: Date): string {
    const local = new Date(date.getTime() + StatsService.TZ_OFFSET_MS);
    return local.toISOString().slice(0, 10);
  }

  private static getUtc8DayRange(days: number): { start: Date; end: Date } {
    const now = Date.now();
    const nowUtc8 = new Date(now + StatsService.TZ_OFFSET_MS);
    const utc8DayStartMs = Date.UTC(
      nowUtc8.getUTCFullYear(),
      nowUtc8.getUTCMonth(),
      nowUtc8.getUTCDate(),
    );
    const startUtc8Ms = utc8DayStartMs - (days - 1) * 24 * 60 * 60 * 1000;
    return {
      start: new Date(startUtc8Ms - StatsService.TZ_OFFSET_MS),
      end: new Date(now),
    };
  }

  private static toRate(numerator: number, denominator: number): number {
    if (!denominator) return 0;
    return Number((numerator / denominator).toFixed(4));
  }

  private static toAvg(total: number, denominator: number): number {
    if (!denominator) return 0;
    return Number((total / denominator).toFixed(2));
  }

  /**
   * 获取用户统计信息
   */
  static async getUserStats(userId: string): Promise<UserStats> {
    const [noteBookCount, noteCount] = await Promise.all([
      NoteBook.countDocuments({ userId }),
      Note.countDocuments({ userId }),
    ]);
    return {
      noteBookCount,
      noteCount,
    };
  }

  /**
   * 获取标签统计信息
   */
  static async getTagStats(userId: string): Promise<TagStats[]> {
    // 使用MongoDB的聚合管道统计标签使用频率
    const tagStats = await Note.aggregate([
      { $match: { userId } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
      { $project: { tag: "$_id", count: 1, _id: 0 } },
    ]);

    return tagStats;
  }

  /**
   * 获取用户活动时间线
   */
  static async getUserActivityTimeline(
    userId: string,
    limit: number = 20,
  ): Promise<LeanActivity[]> {
    const activities = await Activity.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return toLeanActivityArray(activities);
  }

  /**
   * 获取手帐本使用统计
   */
  static async getNoteBookUsageStats(userId: string): Promise<
    Array<{
      noteBookId: string;
      title: string;
      noteCount: number;
      lastUpdated: Date;
    }>
  > {
    const noteBooks = await NoteBook.find({ userId }).lean();
    const noteCounts = await Note.aggregate([
      { $match: { userId } },
      { $group: { _id: "$noteBookId", count: { $sum: 1 } } },
    ]);

    const noteCountMap = new Map(
      noteCounts.map((item) => [item._id.toString(), item.count]),
    );

    const lastUpdates = await Note.aggregate([
      { $match: { userId } },
      { $group: { _id: "$noteBookId", lastUpdated: { $max: "$updatedAt" } } },
    ]);

    const lastUpdateMap = new Map(
      lastUpdates.map((item) => [item._id.toString(), item.lastUpdated]),
    );

    return noteBooks.map((noteBook) => ({
      noteBookId: noteBook._id.toString(),
      title: noteBook.title,
      noteCount: noteCountMap.get(noteBook._id.toString()) || 0,
      lastUpdated:
        lastUpdateMap.get(noteBook._id.toString()) || noteBook.updatedAt,
    }));
  }

  static async getOverviewStats(userId: string): Promise<OverviewStats> {
    const { start: start7d } = StatsService.getUtc8DayRange(7);
    const { start: start30d } = StatsService.getUtc8DayRange(30);

    const [notebookTotal, noteTotal, newNotes7d, newNotes30d, lastEdited] =
      await Promise.all([
        NoteBook.countDocuments({ userId }),
        Note.countDocuments({ userId }),
        Note.countDocuments({ userId, createdAt: { $gte: start7d } }),
        Note.countDocuments({ userId, createdAt: { $gte: start30d } }),
        Note.findOne({ userId }).sort({ updatedAt: -1 }).select("updatedAt").lean(),
      ]);

    return {
      notebookTotal,
      noteTotal,
      newNotes7d,
      newNotes30d,
      lastEditedAt: lastEdited?.updatedAt ?? null,
    };
  }

  static async getCreationTrendStats(
    userId: string,
    range: 7 | 30,
  ): Promise<CreationTrendStats> {
    const { start } = StatsService.getUtc8DayRange(range);

    const [createdNotes, updatedNotes] = await Promise.all([
      Note.find({ userId, createdAt: { $gte: start } })
        .select("createdAt")
        .lean(),
      Note.find({ userId, updatedAt: { $gte: start } })
        .select("updatedAt")
        .lean(),
    ]);

    const now = Date.now();
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < range; i += 1) {
      const day = new Date(now - (range - 1 - i) * 24 * 60 * 60 * 1000);
      dailyMap.set(StatsService.toUtc8DateKey(day), 0);
    }
    for (const item of createdNotes) {
      const key = StatsService.toUtc8DateKey(new Date(item.createdAt));
      if (dailyMap.has(key)) {
        dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
      }
    }

    const hourlyBucket = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: 0,
    }));
    for (const item of updatedNotes) {
      const date = new Date(item.updatedAt);
      const hour = new Date(date.getTime() + StatsService.TZ_OFFSET_MS).getUTCHours();
      hourlyBucket[hour].count += 1;
    }

    const dailyCreated = Array.from(dailyMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));
    const totalCreated = dailyCreated.reduce((acc, item) => acc + item.count, 0);

    return {
      range,
      dailyCreated,
      hourlyUpdated: hourlyBucket,
      avgDailyCreated: StatsService.toAvg(totalCreated, range),
    };
  }

  static async getTagQualityStats(userId: string): Promise<TagQualityStats> {
    const [noteTotal, notes] = await Promise.all([
      Note.countDocuments({ userId }),
      Note.find({ userId }).select("tags").lean(),
    ]);

    let taggedNoteCount = 0;
    let totalTagCount = 0;
    const tagCounter = new Map<string, number>();

    for (const note of notes) {
      const tags = Array.isArray(note.tags) ? note.tags.filter(Boolean) : [];
      if (tags.length > 0) {
        taggedNoteCount += 1;
      }
      totalTagCount += tags.length;
      for (const tag of tags) {
        tagCounter.set(tag, (tagCounter.get(tag) || 0) + 1);
      }
    }

    const topTags = Array.from(tagCounter.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const untaggedCount = noteTotal - taggedNoteCount;

    return {
      topTags,
      untaggedRate: StatsService.toRate(untaggedCount, noteTotal),
      tagCoverageRate: StatsService.toRate(taggedNoteCount, noteTotal),
      avgTagsPerNote: StatsService.toAvg(totalTagCount, noteTotal),
    };
  }

  static async getNotebookHealthStats(userId: string): Promise<NotebookHealthStats> {
    const { start: start30d } = StatsService.getUtc8DayRange(30);
    const noteBooks = await NoteBook.find({ userId }).lean();
    const noteBookIds = noteBooks.map((item) => item._id.toString());

    const [noteCounts, lastUpdates] = await Promise.all([
      Note.aggregate([
        { $match: { userId, noteBookId: { $in: noteBookIds } } },
        { $group: { _id: "$noteBookId", count: { $sum: 1 } } },
      ]),
      Note.aggregate([
        { $match: { userId, noteBookId: { $in: noteBookIds } } },
        { $group: { _id: "$noteBookId", lastUpdatedAt: { $max: "$updatedAt" } } },
      ]),
    ]);

    const countMap = new Map(
      noteCounts.map((item) => [String(item._id), Number(item.count) || 0]),
    );
    const lastUpdatedMap = new Map(
      lastUpdates.map((item) => [String(item._id), item.lastUpdatedAt as Date]),
    );

    let emptyNotebookCount = 0;
    const notebooks: NotebookHealthItem[] = noteBooks.map((noteBook) => {
      const notebookId = noteBook._id.toString();
      const noteCount = countMap.get(notebookId) || 0;
      const lastUpdatedAt = lastUpdatedMap.get(notebookId) || null;
      if (noteCount === 0) {
        emptyNotebookCount += 1;
      }
      return {
        notebookId,
        name: noteBook.title,
        noteCount,
        lastUpdatedAt,
        activeIn30d: !!(lastUpdatedAt && lastUpdatedAt >= start30d),
      };
    });

    notebooks.sort((a, b) => (b.lastUpdatedAt?.getTime() || 0) - (a.lastUpdatedAt?.getTime() || 0));

    return {
      notebooks,
      emptyNotebookCount,
    };
  }

  static async getImageAssetStats(userId: string): Promise<ImageAssetStats> {
    const notes = await Note.find({ userId }).select("images").lean();
    const noteTotal = notes.length;

    let noteWithImageCount = 0;
    let imageTotal = 0;
    let totalImageBytes = 0;
    const formatCounter: Record<"jpeg" | "png" | "webp", number> = {
      jpeg: 0,
      png: 0,
      webp: 0,
    };

    for (const note of notes) {
      const images = Array.isArray(note.images) ? note.images : [];
      if (images.length > 0) {
        noteWithImageCount += 1;
      }
      for (const image of images) {
        imageTotal += 1;
        totalImageBytes += Number(image.size) || 0;
        if (image.mimeType === "image/png") formatCounter.png += 1;
        if (image.mimeType === "image/webp") formatCounter.webp += 1;
        if (image.mimeType === "image/jpeg") formatCounter.jpeg += 1;
      }
    }

    return {
      noteWithImageRate: StatsService.toRate(noteWithImageCount, noteTotal),
      imageTotal,
      avgImagesPerNote: StatsService.toAvg(imageTotal, noteTotal),
      totalImageSizeMB: Number((totalImageBytes / (1024 * 1024)).toFixed(2)),
      formatDistribution: [
        { format: "jpeg", count: formatCounter.jpeg },
        { format: "png", count: formatCounter.png },
        { format: "webp", count: formatCounter.webp },
      ],
    };
  }

  static async getReminderPerformanceStats(
    userId: string,
  ): Promise<ReminderPerformanceStats> {
    const { start: start30d } = StatsService.getUtc8DayRange(30);
    const now = new Date();

    const [total, pending, sent, failed, reminders30d, expiredUnsent, retryAgg] =
      await Promise.all([
        Reminder.countDocuments({ userId }),
        Reminder.countDocuments({ userId, sendStatus: "pending" }),
        Reminder.countDocuments({ userId, sendStatus: "sent" }),
        Reminder.countDocuments({ userId, sendStatus: "failed" }),
        Reminder.find({ userId, remindTime: { $gte: start30d } })
          .select("sendStatus")
          .lean(),
        Reminder.countDocuments({
          userId,
          sendStatus: "pending",
          remindTime: { $lt: now },
        }),
        Reminder.aggregate([
          { $match: { userId } },
          { $group: { _id: null, avgRetryCount: { $avg: "$retryCount" } } },
        ]),
      ]);

    const sent30d = reminders30d.filter((item) => item.sendStatus === "sent").length;
    const successRate30d = StatsService.toRate(sent30d, reminders30d.length);
    const avgRetryCount = Number((retryAgg?.[0]?.avgRetryCount || 0).toFixed(2));

    return {
      total,
      pending,
      sent,
      failed,
      successRate30d,
      avgRetryCount,
      expiredUnsent,
    };
  }

  static async getTemplateUsageStats(userId: string): Promise<TemplateUsageStats> {
    const { start: start30d } = StatsService.getUtc8DayRange(30);
    const [templateTotal, systemTemplateTotal, newTemplate30d] = await Promise.all([
      Template.countDocuments({ userId }),
      Template.countDocuments({ userId, isSystem: true }),
      Template.countDocuments({ userId, createdAt: { $gte: start30d } }),
    ]);

    return {
      templateTotal,
      systemTemplateTotal,
      customTemplateTotal: Math.max(templateTotal - systemTemplateTotal, 0),
      newTemplate30d,
      topUsedTemplates: [],
    };
  }
}
