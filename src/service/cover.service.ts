import User from "../model/User";
import { coverPreviewList } from "../constant/img";

export interface UpdateQuickCoversData {
  covers: string[];
}

export class CoverService {
  /**
   * 获取系统默认封面列表
   */
  static async getSystemCovers(): Promise<string[]> {
    // coverPreviewList是readonly的，需要转换为普通数组
    return [...coverPreviewList];
  }

  /**
   * 获取用户快捷封面列表
   * 如果用户没有设置，则返回默认的前11个封面
   */
  static async getUserQuickCovers(userId: string): Promise<string[]> {
    const user = await User.findOne({ userId }).lean();

    if (!user) {
      throw new Error("用户不存在");
    }

    // 如果用户没有quickCovers字段（旧用户），返回默认值
    if (!user.quickCovers || user.quickCovers.length === 0) {
      return coverPreviewList.slice(0, 11);
    }

    return user.quickCovers;
  }

  /**
   * 更新用户快捷封面列表
   * 验证封面数量：1-11个
   */
  static async updateUserQuickCovers(
    userId: string,
    data: UpdateQuickCoversData,
  ): Promise<{ quickCovers: string[]; quickCoversUpdatedAt: Date }> {
    const { covers } = data;

    // 验证封面数量
    if (covers.length < 1 || covers.length > 11) {
      throw new Error("快捷封面数量必须在1到11个之间");
    }

    // 验证所有封面都在系统封面列表中
    const invalidCovers = covers.filter(
      (cover) => !coverPreviewList.includes(cover),
    );
    if (invalidCovers.length > 0) {
      throw new Error(`无效的封面地址: ${invalidCovers.join(", ")}`);
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId },
      {
        $set: {
          quickCovers: covers,
          quickCoversUpdatedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    ).lean();

    if (!updatedUser) {
      throw new Error("用户不存在");
    }

    return {
      quickCovers: updatedUser.quickCovers,
      quickCoversUpdatedAt: updatedUser.quickCoversUpdatedAt,
    };
  }

  /**
   * 初始化用户快捷封面（用于旧用户迁移）
   */
  static async initUserQuickCovers(userId: string): Promise<void> {
    const user = await User.findOne({ userId });

    if (!user) {
      throw new Error("用户不存在");
    }

    // 如果用户已经有quickCovers，不进行初始化
    if (user.quickCovers && user.quickCovers.length > 0) {
      return;
    }

    // 初始化默认封面
    user.quickCovers = coverPreviewList.slice(0, 11);
    user.quickCoversUpdatedAt = new Date();
    await user.save();
  }
}
