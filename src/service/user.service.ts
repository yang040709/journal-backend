import axios from "axios";
import User from "../model/User";
import NoteBook from "../model/NoteBook";
import { signToken } from "../utils/jwt";
import Activity from "../model/Activity";
import { coverPreviewList, defaultNoteBook } from "../constant/img";

export interface LoginResult {
  token: string;
  userId: string;
}

export class UserService {
  /**
   * 用户登录 - 优化版本
   */
  static async login(code: string): Promise<LoginResult> {
    try {
      // 1. 获取微信openid
      const openid = await this.fetchWechatOpenId(code);

      // 2. 使用findOneAndUpdate实现查找或创建用户（原子操作）
      // 先尝试查找用户
      let user = await User.findOne({ userId: openid });
      let isNewUser = false;

      if (user) {
        // 用户已存在，直接使用
        isNewUser = false;
      } else {
        // 用户不存在，创建新用户
        user = await User.create({
          userId: openid,
          quickCovers: coverPreviewList.slice(0, 11),
          quickCoversUpdatedAt: new Date(),
        });
        isNewUser = true;
        // 为新用户异步创建默认手帐本（不阻塞登录响应）
        await this.createDefaultNoteBooks(openid).catch((error) => {
          console.error("创建默认手帐本失败（不影响登录）:", error);
        });
      }

      // 4. 异步记录活动日志（不阻塞登录响应）
      const activityPromise = Activity.create({
        type: isNewUser ? "create" : "update",
        target: "noteBook",
        targetId: user.id,
        title: isNewUser ? "新用户注册" : "用户登录",
        userId: user.userId,
      }).catch((error) => {
        console.error("记录活动日志失败（不影响登录）:", error);
      });

      // 5. 等待token生成完成
      const token = signToken({ userId: user.userId });

      // 6. 不等待活动记录完成，直接返回响应
      // activityPromise会在后台完成

      return {
        token,
        userId: user.userId,
      };
    } catch (error) {
      console.error("用户登录失败:", error);
      if (error instanceof Error) {
        throw new Error(`登录失败：${error.message}`);
      }
      throw new Error("登录失败：未知错误");
    }
  }

  /**
   * 调用微信接口获取openid（带超时和重试）
   */
  private static async fetchWechatOpenId(code: string): Promise<string> {
    try {
      const response = await axios({
        method: "get",
        url: "https://api.weixin.qq.com/sns/jscode2session",
        params: {
          js_code: code,
          appid: process.env.WX_APPID,
          secret: process.env.WX_SECRET,
          grant_type: "authorization_code",
        },
        timeout: 5000, // 5秒超时
      });

      if (!response.data || !response.data.openid) {
        throw new Error("微信登录失败：未获取到 openid");
      }

      return response.data.openid;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          throw new Error("微信接口请求超时，请稍后重试");
        }
        if (error.response) {
          throw new Error(
            `微信接口错误: ${error.response.status} ${error.response.statusText}`,
          );
        }
      }
      throw error;
    }
  }

  /**
   * 为新用户创建默认手帐本
   */
  private static async createDefaultNoteBooks(userId: string): Promise<void> {
    try {
      const noteBooks = defaultNoteBook.map((noteBook) => ({
        title: noteBook.title,
        coverImg: noteBook.coverImg,
        count: 0,
        userId,
      }));

      await NoteBook.insertMany(noteBooks);
      console.log(
        `✅ 为用户 ${userId} 创建了 ${noteBooks.length} 个默认手帐本`,
      );
    } catch (error) {
      console.error("创建默认手帐本失败:", error);
      // 不抛出错误，避免影响用户登录
    }
  }

  /**
   * 获取用户信息
   */
  static async getUserInfo(userId: string) {
    const user = await User.findOne({ userId }).lean();
    if (!user) {
      throw new Error("用户不存在");
    }

    return {
      userId: user.userId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * 验证用户是否存在
   */
  static async validateUser(userId: string): Promise<boolean> {
    const user = await User.findOne({ userId });
    return !!user;
  }
}
