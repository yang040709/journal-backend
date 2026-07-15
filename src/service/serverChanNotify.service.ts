import axios from "axios";
import {
  getServerChanChannel,
  getServerChanSendKey,
  isServerChanAdminLoginEnabled,
} from "../config/serverChanEnv";
import { WechatMpNotifyService } from "./wechatMpNotify.service";
import { logger } from "../utils/logger";

interface ServerChanSendResponse {
  code?: number;
  message?: string;
  data?: {
    pushid?: string;
    readkey?: string;
  };
}

export class ServerChanNotifyService {
  static isAdminLoginEnabled(): boolean {
    return isServerChanAdminLoginEnabled();
  }

  private static buildAdminLoginDesp(payload: {
    username: string;
    ip: string;
    at?: Date;
  }): string {
    const username = WechatMpNotifyService.truncate(payload.username, 20);
    const time = WechatMpNotifyService.formatDateTime(payload.at || new Date());
    const ip = WechatMpNotifyService.truncate(payload.ip, 20);

    return [
      `**账号**：${username}`,
      "",
      `**时间**：${time}`,
      "",
      `**IP**：${ip}`,
      "",
      "如非本人操作，请立即修改密码。",
    ].join("\n");
  }

  private static async send(payload: {
    title: string;
    desp: string;
  }): Promise<boolean> {
    const sendKey = getServerChanSendKey();
    if (!sendKey) return false;

    const body: Record<string, string> = {
      title: WechatMpNotifyService.truncate(payload.title, 32),
      desp: payload.desp,
    };
    const channel = getServerChanChannel();
    if (channel) {
      body.channel = channel;
    }

    const res = await axios.post<ServerChanSendResponse>(
      `https://sctapi.ftqq.com/${sendKey}.send`,
      body,
      {
        timeout: 10000,
        headers: { "Content-Type": "application/json;charset=utf-8" },
      },
    );

    if (res.data?.code !== 0) {
      logger.error("Server酱推送失败", {
        code: res.data?.code,
        message: res.data?.message,
      });
      return false;
    }

    return true;
  }

  static async notifyAdminLogin(payload: {
    username: string;
    ip: string;
    at?: Date;
  }): Promise<void> {
    if (!this.isAdminLoginEnabled()) return;

    try {
      await this.send({
        title: "Journal 管理后台登录提醒",
        desp: this.buildAdminLoginDesp(payload),
      });
    } catch (error) {
      logger.error("Server酱管理员登录通知发送异常", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
