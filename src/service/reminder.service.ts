import Reminder, { IReminder } from "../model/Reminder";
import { ActivityLogger } from "../utils/ActivityLogger";
import { toLeanReminder, toLeanReminderArray } from "../utils/typeUtils";
import { NoteService } from "./note.service";
import { WeChatService } from "./wechat.service";

export interface CreateReminderData {
  noteId: string;
  content: string;
  remindTime: Date;
  title?: string;
}

export interface UpdateReminderData {
  content?: string;
  remindTime?: Date;
  subscriptionStatus?: "pending" | "subscribed" | "cancelled";
  sendStatus?: "pending" | "sending" | "sent" | "failed";
  retryCount?: number;
  lastError?: string;
  sentAt?: Date;
}

function getReminderDbId(reminder: { id?: string; _id?: unknown }): string {
  return String(reminder.id || reminder._id);
}

/** sending 卡住超过该时间则回收为 pending */
export const REMINDER_SEND_STUCK_MS = 15 * 60 * 1000;

export class ReminderService {
  /**
   * 创建提醒
   */
  static async createReminder(
    userId: string,
    data: CreateReminderData,
  ): Promise<IReminder> {
    // 获取手帐信息
    const note = await NoteService.getNoteById(data.noteId, userId);
    if (!note) {
      throw new Error("手帐不存在或无权访问");
    }

    // 创建提醒
    const reminder = await Reminder.create({
      userId,
      noteId: data.noteId,
      title: data.title || note.title,
      content: data.content,
      remindTime: data.remindTime,
      subscriptionStatus: "pending",
      sendStatus: "pending",
    });

    // 记录活动
    ActivityLogger.record(
      {
        type: "create",
        target: "reminder",
        targetId: reminder.id,
        title: `创建提醒：${data.title || note.title}`,
        userId,
      },
      { blocking: false },
    );

    return toLeanReminder(reminder.toJSON()) as unknown as IReminder;
  }

  /**
   * 获取用户的提醒列表
   */
  static async getUserReminders(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      status?: "pending" | "subscribed" | "cancelled";
      sendStatus?: "pending" | "sending" | "sent" | "failed";
    } = {},
  ): Promise<{
    items: IReminder[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, status, sendStatus } = options;

    const query: any = { userId };
    if (status) query.subscriptionStatus = status;
    if (sendStatus) query.sendStatus = sendStatus;

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Reminder.find(query)
        .sort({ remindTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Reminder.countDocuments(query),
    ]);

    return {
      items: toLeanReminderArray(items) as unknown as IReminder[],
      total,
      page,
      limit,
    };
  }

  /**
   * 获取单个提醒
   */
  static async getReminderById(
    id: string,
    userId: string,
  ): Promise<IReminder | null> {
    const reminder = await Reminder.findOne({ _id: id, userId }).lean();
    return reminder
      ? (toLeanReminder(reminder) as unknown as IReminder)
      : null;
  }

  /**
   * 更新提醒
   */
  static async updateReminder(
    id: string,
    userId: string,
    data: UpdateReminderData,
  ): Promise<IReminder | null> {
    // 先获取更新前的提醒信息
    const existingReminder = await Reminder.findOne({ _id: id, userId });
    if (!existingReminder) {
      return null;
    }

    const reminder = await Reminder.findOneAndUpdate(
      { _id: id, userId },
      { $set: data },
      { new: true },
    ).lean();

    // 记录活动
    ActivityLogger.record(
      {
        type: "update",
        target: "reminder",
        targetId: id,
        title: `更新提醒：${existingReminder.title}`,
        userId,
      },
      { blocking: false },
    );

    return reminder
      ? (toLeanReminder(reminder) as unknown as IReminder)
      : null;
  }

  /**
   * 删除提醒
   */
  static async deleteReminder(id: string, userId: string): Promise<boolean> {
    // 先获取要删除的提醒信息
    const reminder = await Reminder.findOne({ _id: id, userId });
    if (!reminder) {
      return false;
    }

    const result = await Reminder.deleteOne({ _id: id, userId });
    const deleted = result.deletedCount > 0;

    if (deleted) {
      // 记录活动
      ActivityLogger.record(
        {
          type: "delete",
          target: "reminder",
          targetId: id,
          title: `删除提醒：${reminder.title}`,
          userId,
        },
        { blocking: false },
      );
    }

    return deleted;
  }

  /**
   * 批量删除提醒
   */
  static async batchDeleteReminders(
    reminderIds: string[],
    userId: string,
  ): Promise<number> {
    if (!reminderIds.length) {
      return 0;
    }

    // 获取要删除的提醒信息
    const reminders = await Reminder.find({
      _id: { $in: reminderIds },
      userId,
    });
    if (!reminders.length) {
      return 0;
    }

    const result = await Reminder.deleteMany({
      _id: { $in: reminderIds },
      userId,
    });
    const deletedCount = result.deletedCount || 0;

    if (deletedCount > 0) {
      // 记录活动
      ActivityLogger.record(
        {
          type: "delete",
          target: "reminder",
          targetId: "batch",
          title: `批量删除提醒：共删除${deletedCount}条`,
          userId,
        },
        { blocking: false },
      );
    }

    return deletedCount;
  }

  /**
   * 手帐软删：标记关联提醒不可用，并取消未发送完的订阅
   */
  static async markUnavailableByNoteId(
    noteId: string,
    userId: string,
  ): Promise<number> {
    return this.markUnavailableByNoteIds([noteId], userId);
  }

  /**
   * 批量手帐软删：标记关联提醒不可用
   */
  static async markUnavailableByNoteIds(
    noteIds: string[],
    userId: string,
  ): Promise<number> {
    const ids = [...new Set(noteIds.map(String).filter(Boolean))];
    if (!ids.length) return 0;

    const now = new Date();
    const filter = { noteId: { $in: ids }, userId };

    const result = await Reminder.updateMany(filter, {
      $set: {
        noteUnavailable: true,
        noteUnavailableAt: now,
      },
    });

    // 未成功发送的：取消 subscribed / pending，避免用户误以为还会推送
    await Reminder.updateMany(
      {
        ...filter,
        sendStatus: { $ne: "sent" },
        subscriptionStatus: { $in: ["subscribed", "pending"] },
      },
      { $set: { subscriptionStatus: "cancelled" } },
    );

    return result.modifiedCount || 0;
  }

  /**
   * 手帐从废纸篓恢复：清除不可用标记；不自动恢复 subscribed
   */
  static async clearUnavailableByNoteId(
    noteId: string,
    userId: string,
  ): Promise<number> {
    const result = await Reminder.updateMany(
      { noteId, userId, noteUnavailable: true },
      {
        $set: {
          noteUnavailable: false,
          noteUnavailableAt: null,
        },
      },
    );
    return result.modifiedCount || 0;
  }

  /**
   * 手帐永久清除：删除关联提醒
   */
  static async deleteByNoteId(
    noteId: string,
    userId: string,
  ): Promise<number> {
    const result = await Reminder.deleteMany({ noteId, userId });
    return result.deletedCount || 0;
  }

  /**
   * 获取待发送的提醒
   */
  static async getPendingReminders(
    beforeTime: Date = new Date(),
  ): Promise<IReminder[]> {
    const reminders = await Reminder.find({
      remindTime: { $lte: beforeTime },
      subscriptionStatus: "subscribed",
      sendStatus: "pending",
      retryCount: { $lt: 3 },
      noteUnavailable: { $ne: true },
    }).lean();

    return toLeanReminderArray(reminders) as unknown as IReminder[];
  }

  /**
   * 回收卡住的 sending（进程崩溃 / 微信调用超时等），使其可再次发送。
   */
  static async reclaimStuckSending(
    now = new Date(),
    stuckMs = REMINDER_SEND_STUCK_MS,
  ): Promise<number> {
    const cutoff = new Date(now.getTime() - stuckMs);
    const result = await Reminder.updateMany(
      {
        sendStatus: "sending",
        $or: [
          { sendLockedAt: { $lte: cutoff } },
          { sendLockedAt: null },
          { sendLockedAt: { $exists: false } },
        ],
      },
      {
        $set: {
          sendStatus: "pending",
          sendLockedAt: null,
          lastError: "send lock reclaimed after timeout",
        },
      },
    );
    return result.modifiedCount || 0;
  }

  /**
   * 原子认领待发送提醒（pending → sending），避免多实例重复推送。
   */
  static async claimReminderForSend(
    reminderId: string,
  ): Promise<IReminder | null> {
    const now = new Date();
    const claimed = await Reminder.findOneAndUpdate(
      {
        _id: reminderId,
        sendStatus: "pending",
        subscriptionStatus: "subscribed",
        retryCount: { $lt: 3 },
        noteUnavailable: { $ne: true },
      },
      { $set: { sendStatus: "sending", sendLockedAt: now } },
      { new: true },
    ).lean();

    return claimed
      ? (toLeanReminder(claimed) as unknown as IReminder)
      : null;
  }

  /**
   * 发送提醒（调用方应已通过 claimReminderForSend 认领，或传入仍为 pending 的文档由本方法认领）
   */
  static async sendReminder(reminder: IReminder): Promise<boolean> {
    const id = getReminderDbId(reminder);
    let toSend = reminder;
    if (reminder.sendStatus !== "sending") {
      const claimed = await this.claimReminderForSend(id);
      if (!claimed) {
        return false;
      }
      toSend = claimed;
    }

    try {
      // 双保险：关联手帐不存在或已软删则标记不可用并中止
      if (toSend.noteUnavailable) {
        await this.abortSendDueToUnavailableNote(toSend);
        return false;
      }
      const note = await NoteService.getNoteById(toSend.noteId, toSend.userId);
      if (!note) {
        await this.markUnavailableByNoteId(toSend.noteId, toSend.userId);
        await this.abortSendDueToUnavailableNote(toSend);
        return false;
      }

      const templateData = this.prepareTemplateData(toSend);

      const success = await WeChatService.sendSubscriptionMessage({
        userId: toSend.userId,
        templateId: toSend.messageId,
        data: templateData,
        page: `pages/note-detail/note-detail?noteId=${toSend.noteId}`,
      });

      if (success) {
        await Reminder.updateOne(
          { _id: id },
          {
            $set: {
              sendStatus: "sent",
              sentAt: new Date(),
              sendLockedAt: null,
            },
            $inc: { retryCount: 1 },
          },
        );
        return true;
      }
      await this.handleSendFailure(toSend, "微信消息发送失败");
      return false;
    } catch (error: any) {
      await this.handleSendFailure(
        toSend,
        error.message || "发送消息时发生异常",
      );
      return false;
    }
  }

  /**
   * 因关联手帐不可用中止发送：释放 sending 锁，不再推送
   */
  private static async abortSendDueToUnavailableNote(
    reminder: IReminder,
  ): Promise<void> {
    const id = getReminderDbId(reminder);
    await Reminder.updateOne(
      { _id: id },
      {
        $set: {
          sendStatus: "pending",
          sendLockedAt: null,
          lastError: "关联手帐已删除或不存在",
        },
      },
    );
  }

  /**
   * 准备模板消息数据
   * 根据微信模板消息要求格式化数据
   */
  private static prepareTemplateData(
    reminder: IReminder,
  ): Record<string, { value: string }> {
    // 微信模板消息字段要求：
    // thing5: 日程标题 - 最多20个字符
    // thing2: 提醒内容 - 最多20个字符
    // time3: 执行时间 - 格式为 "YYYY-MM-DD HH:mm"

    return {
      thing5: {
        value: this.truncateString(reminder.title, 20),
      },
      thing2: {
        value: this.truncateString(reminder.content, 20),
      },
      time3: {
        value: this.formatTime(reminder.remindTime),
      },
    };
  }

  /**
   * 截断字符串，确保不超过指定长度
   */
  private static truncateString(str: string, maxLength: number): string {
    if (!str) return "";

    // 去除首尾空格
    const trimmed = str.trim();

    // 如果长度不超过限制，直接返回
    if (trimmed.length <= maxLength) {
      return trimmed;
    }

    // 截断并添加省略号
    return trimmed.substring(0, maxLength - 1) + "…";
  }

  /**
   * 处理发送失败：正确使用顶层 $inc，未达上限则回到 pending 以便重试。
   */
  private static async handleSendFailure(
    reminder: IReminder,
    error: string,
  ): Promise<void> {
    const id = getReminderDbId(reminder);
    const current = await Reminder.findById(id).select("retryCount").lean();
    const nextRetry =
      Math.max(0, Math.floor(Number(current?.retryCount ?? reminder.retryCount ?? 0))) + 1;
    const failed = nextRetry >= 3;

    await Reminder.updateOne(
      { _id: id },
      {
        $set: {
          lastError: error,
          sendStatus: failed ? "failed" : "pending",
          sendLockedAt: null,
        },
        $inc: { retryCount: 1 },
      },
    );
  }

  /**
   * 格式化为上海墙钟时间（与主机本地时区无关）。
   * 导出供单元测试断言。
   */
  static formatTime(date: Date): string {
    const timezone = process.env.UPLOAD_QUOTA_TIMEZONE || "Asia/Shanghai";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value || "00";

    // en-CA 在部分环境下 hour 可能为 "24"（午夜），规范为 "00"
    const hourRaw = get("hour");
    const hour = hourRaw === "24" ? "00" : hourRaw;

    return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}`;
  }

  /**
   * 更新订阅状态
   */
  static async updateSubscriptionStatus(
    id: string,
    userId: string,
    status: "subscribed" | "cancelled",
  ): Promise<IReminder | null> {
    return this.updateReminder(id, userId, {
      subscriptionStatus: status,
    });
  }

  /**
   * 清理过期的提醒
   * 清理规则：
   * 1. 超过指定时间且发送失败的提醒
   * 2. 超过指定时间且已取消订阅的提醒
   * 3. 保留已发送成功的提醒供用户查看
   */
  static async cleanupExpiredReminders(
    cutoffTime: Date,
  ): Promise<{ deletedCount: number }> {
    try {
      // 删除条件：
      // 1. 创建时间早于 cutoffTime
      // 2. 并且（发送状态为失败 或者 订阅状态为已取消）
      const result = await Reminder.deleteMany({
        createdAt: { $lt: cutoffTime },
        $or: [{ sendStatus: "failed" }, { subscriptionStatus: "cancelled" }],
      });

      return { deletedCount: result.deletedCount };
    } catch (error) {
      console.error("清理过期提醒失败:", error);
      throw error;
    }
  }
}
