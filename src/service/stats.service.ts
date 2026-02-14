import NoteBook from "../model/NoteBook";
import Note from "../model/Note";
import Activity, { IActivity, LeanActivity } from "../model/Activity";
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

export class StatsService {
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
}
