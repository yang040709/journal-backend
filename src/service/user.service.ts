import axios from "axios";
import User from "../model/User";
import NoteBook from "../model/NoteBook";
import { signToken } from "../utils/jwt";
import Activity from "../model/Activity";
import { defaultNoteBook } from "../constant/img";

export interface LoginResult {
  token: string;
  userId: string;
}

export class UserService {
  /**
   * 用户登录
   */
  static async login(code: string): Promise<LoginResult> {
    try {
      // 调用微信接口获取 openid
      const response = await axios({
        method: "get",
        url: "https://api.weixin.qq.com/sns/jscode2session",
        params: {
          js_code: code,
          appid: process.env.WX_APPID,
          secret: process.env.WX_SECRET,
          grant_type: "authorization_code",
        },
      });

      if (!response.data || !response.data.openid) {
        throw new Error("微信登录失败：未获取到 openid");
      }

      const { openid } = response.data;

      // 查找或创建用户
      let user = await User.findOne({ userId: openid });
      const isNewUser = !user;

      if (!user) {
        user = await User.create({ userId: openid });
        await user.save();

        // 为新用户创建默认手帐本
        if (isNewUser) {
          await this.createDefaultNoteBooks(openid);
        }
      }

      // 生成 JWT token
      const token = signToken({ userId: user.userId });

      // 记录活动（使用 noteBook 作为 target，因为 Activity 模型目前只支持 noteBook 和 note）
      await Activity.create({
        type: isNewUser ? "create" : "update", // 使用 create 表示注册，update 表示登录
        target: "noteBook", // 暂时使用 noteBook 作为 target
        targetId: user.id,
        title: isNewUser ? "新用户注册" : "用户登录",
        userId: user.userId,
      });

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
        `✅ 为用户 ${userId} 创建了 ${noteBooks.length} 个默认手帐本`
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
