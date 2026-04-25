import Reminder, { IReminder } from "../model/Reminder";
import { ensurePageDepth, pickSortField } from "../utils/querySafety";

function serializeReminder(doc: {
  _id: { toString: () => string };
  userId: string;
  noteId: string;
  title: string;
  content: string;
  remindTime: Date;
  messageId: string;
  subscriptionStatus: string;
  sendStatus: string;
  retryCount: number;
  lastError?: string;
  sentAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    noteId: doc.noteId,
    title: doc.title,
    content: doc.content,
    remindTime: doc.remindTime,
    messageId: doc.messageId,
    subscriptionStatus: doc.subscriptionStatus,
    sendStatus: doc.sendStatus,
    retryCount: doc.retryCount,
    lastError: doc.lastError || "",
    sentAt: doc.sentAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface AdminReminderListParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: "asc" | "desc";
  userId?: string;
  noteId?: string;
  sendStatus?: "pending" | "sent" | "failed";
  subscriptionStatus?: "pending" | "subscribed" | "cancelled";
  remindTimeFrom?: Date;
  remindTimeTo?: Date;
}

export class AdminReminderService {
  static async listReminders(params: AdminReminderListParams = {}) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    ensurePageDepth({ page, limit });
    const skip = (page - 1) * limit;
    const sortField = pickSortField(
      ["remindTime", "createdAt", "updatedAt", "retryCount"] as const,
      params.sortBy,
      "remindTime",
    );
    const sortOrder = params.order === "asc" ? 1 : -1;

    const query: Record<string, unknown> = {};
    if (params.userId?.trim()) {
      query.userId = params.userId.trim();
    }
    if (params.noteId?.trim()) {
      query.noteId = params.noteId.trim();
    }
    if (params.sendStatus) {
      query.sendStatus = params.sendStatus;
    }
    if (params.subscriptionStatus) {
      query.subscriptionStatus = params.subscriptionStatus;
    }
    if (params.remindTimeFrom || params.remindTimeTo) {
      const rt: Record<string, Date> = {};
      if (params.remindTimeFrom) {
        rt.$gte = params.remindTimeFrom;
      }
      if (params.remindTimeTo) {
        rt.$lte = params.remindTimeTo;
      }
      query.remindTime = rt;
    }

    const [items, total] = await Promise.all([
      Reminder.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Reminder.countDocuments(query),
    ]);
    return {
      items: items.map((d) =>
        serializeReminder(d as unknown as Parameters<typeof serializeReminder>[0]),
      ),
      total,
    };
  }

  static async getReminderById(id: string) {
    const doc = await Reminder.findById(id).lean();
    if (!doc) {
      return null;
    }
    return serializeReminder(doc as unknown as Parameters<typeof serializeReminder>[0]);
  }

  /**
   * 运营更新：可改内容与提醒时间。
   * resetFailedToPending：仅当当前 sendStatus 为 failed 时，置为 pending 并清空 lastError，retryCount 归零，供调度重新拾取。
   */
  static async updateReminder(
    id: string,
    data: {
      content?: string;
      remindTime?: Date;
      resetFailedToPending?: boolean;
    },
  ): Promise<IReminder | null> {
    const doc = await Reminder.findById(id);
    if (!doc) {
      return null;
    }
    if (data.content !== undefined) {
      doc.content = data.content.trim();
    }
    if (data.remindTime !== undefined) {
      doc.remindTime = data.remindTime;
    }
    if (data.resetFailedToPending) {
      if (doc.sendStatus === "failed") {
        doc.sendStatus = "pending";
        doc.lastError = "";
        doc.retryCount = 0;
      }
    }
    await doc.save();
    return doc;
  }

  static async deleteReminder(id: string): Promise<boolean> {
    const r = await Reminder.deleteOne({ _id: id });
    return r.deletedCount === 1;
  }
}
