import Reminder, { IReminder } from "../model/Reminder";
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
  sendStatus?: "pending" | "sent" | "failed";
  retryCount?: number;
  lastError?: string;
  sentAt?: Date;
}

export class ReminderService {
  /**
   * 创建提醒
   */
  static async createReminder(
    userId: string,
    data: CreateReminderData
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

    return reminder;
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
      sendStatus?: "pending" | "sent" | "failed";
    } = {}
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
      items: items as unknown as IReminder[],
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
    userId: string
  ): Promise<IReminder | null> {
    const reminder = await Reminder.findOne({ _id: id, userId }).lean();
    return reminder as unknown as IReminder | null;
  }

  /**
   * 更新提醒
   */
  static async updateReminder(
    id: string,
    userId: string,
    data: UpdateReminderData
  ): Promise<IReminder | null> {
    const reminder = await Reminder.findOneAndUpdate(
      { _id: id, userId },
      { $set: data },
      { new: true }
    ).lean();

    return reminder as unknown as IReminder | null;
  }

  /**
   * 删除提醒
   */
  static async deleteReminder(id: string, userId: string): Promise<boolean> {
    const result = await Reminder.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  }

  /**
   * 批量删除提醒
   */
  static async batchDeleteReminders(
    reminderIds: string[],
    userId: string
  ): Promise<number> {
    const result = await Reminder.deleteMany({
      _id: { $in: reminderIds },
      userId,
    });
    return result.deletedCount;
  }

  /**
   * 获取待发送的提醒
   */
  static async getPendingReminders(
    beforeTime: Date = new Date()
  ): Promise<IReminder[]> {
    const reminders = await Reminder.find({
      remindTime: { $lte: beforeTime },
      subscriptionStatus: "subscribed",
      sendStatus: "pending",
      retryCount: { $lt: 3 },
    }).lean();

    return reminders as unknown as IReminder[];
  }

  /**
   * 发送提醒
   */
  static async sendReminder(reminder: IReminder): Promise<boolean> {
    try {
      // 准备模板消息数据，确保符合微信要求
      const templateData = this.prepareTemplateData(reminder);

      // 调用微信服务发送消息
      const success = await WeChatService.sendSubscriptionMessage({
        userId: reminder.userId,
        templateId: reminder.messageId,
        data: templateData,
      });

      if (success) {
        // 更新发送状态
        await Reminder.updateOne(
          { _id: reminder._id },
          {
            $set: {
              sendStatus: "sent",
              sentAt: new Date(),
            },
            $inc: { retryCount: 1 },
          }
        );
        return true;
      } else {
        // 发送失败，更新重试次数
        await this.handleSendFailure(reminder, "微信消息发送失败");
        return false;
      }
    } catch (error: any) {
      // 发送异常，更新错误信息
      await this.handleSendFailure(
        reminder,
        error.message || "发送消息时发生异常"
      );
      return false;
    }
  }

  /**
   * 准备模板消息数据
   * 根据微信模板消息要求格式化数据
   */
  private static prepareTemplateData(
    reminder: IReminder
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
   * 处理发送失败
   */
  private static async handleSendFailure(
    reminder: IReminder,
    error: string
  ): Promise<void> {
    const updateData: any = {
      lastError: error,
      $inc: { retryCount: 1 },
    };

    // 如果重试次数达到上限，标记为失败
    if (reminder.retryCount + 1 >= 3) {
      updateData.sendStatus = "failed";
    }

    await Reminder.updateOne({ _id: reminder._id }, { $set: updateData });
  }

  /**
   * 格式化时间
   */
  private static formatTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  /**
   * 更新订阅状态
   */
  static async updateSubscriptionStatus(
    id: string,
    userId: string,
    status: "subscribed" | "cancelled"
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
    cutoffTime: Date
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
