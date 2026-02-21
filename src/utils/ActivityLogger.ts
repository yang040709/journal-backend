import Activity, { IActivity } from "../model/Activity";

export class ActivityLogger {
  /**
   * 记录活动日志
   * @param data 活动数据
   * @param options 配置选项
   * @param options.blocking 是否阻塞执行，默认为 false（非阻塞）
   */
  static async record(
    data: Partial<IActivity>,
    options: { blocking?: boolean } = {},
  ): Promise<void> {
    const { blocking = false } = options;

    if (blocking) {
      // 阻塞模式：等待创建完成
      await Activity.create(data);
    } else {
      // 非阻塞模式：不等待，错误捕获
      void Activity.create(data).catch((err) => {
        console.error("[ActivityLogger] 记录失败:", err);
        // 可以发送到监控服务
      });
    }
  }
}
