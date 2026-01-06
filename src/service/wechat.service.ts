import axios from "axios";

export interface WeChatAccessToken {
  access_token: string;
  expires_in: number;
}

export interface SubscriptionMessageData {
  userId: string;
  templateId: string;
  data: Record<string, { value: string }>;
  page?: string;
  miniprogram_state?: "developer" | "trial" | "formal";
  lang?: "zh_CN" | "zh_TW" | "en";
}

export class WeChatService {
  private static appId = process.env.WX_APPID || "";
  private static appSecret = process.env.WX_SECRET || "";
  private static accessToken: string = "";
  private static tokenExpiresAt: number = 0;

  /**
   * 获取微信访问令牌
   */
  private static async getAccessToken(): Promise<string> {
    // 如果令牌未过期，直接返回
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    try {
      const response = await axios.get<WeChatAccessToken>(
        "https://api.weixin.qq.com/cgi-bin/token",
        {
          params: {
            grant_type: "client_credential",
            appid: this.appId,
            secret: this.appSecret,
          },
        }
      );

      if (response.data.access_token) {
        this.accessToken = response.data.access_token;
        this.tokenExpiresAt =
          Date.now() + (response.data.expires_in - 300) * 1000; // 提前5分钟过期
        return this.accessToken;
      } else {
        throw new Error("获取微信访问令牌失败");
      }
    } catch (error: any) {
      console.error("获取微信访问令牌失败:", error);
      throw new Error(`获取微信访问令牌失败: ${error.message}`);
    }
  }

  /**
   * 发送订阅消息
   */
  static async sendSubscriptionMessage(
    message: SubscriptionMessageData
  ): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken();

      // 这里需要根据实际情况获取用户的openid
      // 在实际项目中，应该从数据库中查询用户的openid
      const openid = await this.getUserOpenId(message.userId);

      if (!openid) {
        console.error(`用户 ${message.userId} 未绑定微信openid`);
        return false;
      }

      const response = await axios.post(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
        {
          touser: openid,
          template_id: message.templateId,
          data: message.data,
          page: message.page || "pages/index/index",
          miniprogram_state: message.miniprogram_state || "formal",
          lang: message.lang || "zh_CN",
        }
      );

      if (response.data.errcode === 0) {
        console.log(`微信订阅消息发送成功: ${message.userId}`);
        return true;
      } else {
        console.error(`微信订阅消息发送失败:`, response.data);
        return false;
      }
    } catch (error: any) {
      console.error("发送微信订阅消息失败:", error);
      return false;
    }
  }

  /**
   * 获取用户openid
   * 在项目中use_id就是用户的openid
   */
  private static async getUserOpenId(userId: string): Promise<string | null> {
    //在项目中use_id就是用户的openid
    return userId;
  }

  /**
   * 验证消息模板是否有效
   */
  static async validateTemplate(templateId: string): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken();

      // 获取模板列表
      const response = await axios.get(
        `https://api.weixin.qq.com/wxaapi/newtmpl/gettemplate?access_token=${accessToken}`
      );

      if (response.data.errcode === 0) {
        const templates = response.data.data || [];
        return templates.some(
          (template: any) => template.priTmplId === templateId
        );
      }
      return false;
    } catch (error) {
      console.error("验证消息模板失败:", error);
      return false;
    }
  }
}
