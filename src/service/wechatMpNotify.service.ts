import axios from "axios";
import {
  getWeChatMpAdminOpenId,
  getWeChatMpAppId,
  getWeChatMpSecret,
  getWeChatMpTemplateAdminLogin,
  getWeChatMpTemplateAdminOps,
  getWeChatMpTemplateAlert,
  getAdminLoginFailThreshold,
  getAdminLoginFailWindowMinutes,
  isWeChatMpAdminLoginFailNotifyEnabled,
  isWeChatMpAdminLoginNotifyEnabled,
  isWeChatMpAdminOpsNotifyEnabled,
  isWeChatMpAlertNotifyEnabled,
  isWeChatMpConfigured,
} from "../config/wechatMpEnv";
import {
  defaultHighRiskRemark,
  formatAdminLoginFailBurstSummary,
  shouldNotifyAdminLoginFailBurst,
} from "../utils/adminMpNotifyFormat";
import { AlertMetricService } from "./alertMetric.service";
import { logger } from "../utils/logger";

interface WeChatMpTokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

interface WeChatMpSendResponse {
  errcode?: number;
  errmsg?: string;
  msgid?: number;
}

export type WeChatMpTemplateData = Record<string, { value: string; color?: string }>;

export class WechatMpNotifyService {
  private static accessToken = "";
  private static tokenExpiresAt = 0;
  private static lastAdminLoginFailBurstNotifyAt: number | null = null;

  static isConfigured(): boolean {
    return isWeChatMpConfigured();
  }

  static isAdminLoginEnabled(): boolean {
    return isWeChatMpAdminLoginNotifyEnabled() && this.isConfigured();
  }

  static isAlertEnabled(): boolean {
    return isWeChatMpAlertNotifyEnabled() && this.isConfigured();
  }

  static isAdminOpsEnabled(): boolean {
    return isWeChatMpAdminOpsNotifyEnabled() && this.isConfigured();
  }

  static isAdminLoginFailBurstEnabled(): boolean {
    return isWeChatMpAdminLoginFailNotifyEnabled() && this.isConfigured();
  }

  static truncate(value: string, maxLength: number): string {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (trimmed.length <= maxLength) return trimmed;
    if (maxLength <= 1) return trimmed.slice(0, maxLength);
    return `${trimmed.slice(0, maxLength - 1)}…`;
  }

  static formatDateTime(input: Date = new Date()): string {
    const adjustedDate = new Date(input.getTime() + 8 * 60 * 60 * 1000);
    const year = adjustedDate.getUTCFullYear();
    const month = String(adjustedDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(adjustedDate.getUTCDate()).padStart(2, "0");
    const hours = String(adjustedDate.getUTCHours()).padStart(2, "0");
    const minutes = String(adjustedDate.getUTCMinutes()).padStart(2, "0");
    const seconds = String(adjustedDate.getUTCSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private static async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const appid = getWeChatMpAppId();
    const secret = getWeChatMpSecret();
    const res = await axios.get<WeChatMpTokenResponse>(
      "https://api.weixin.qq.com/cgi-bin/token",
      {
        params: {
          grant_type: "client_credential",
          appid,
          secret,
        },
        timeout: 10000,
      },
    );

    if (!res.data?.access_token) {
      throw new Error(res.data?.errmsg || "获取公众号 access_token 失败");
    }

    this.accessToken = res.data.access_token;
    this.tokenExpiresAt = Date.now() + ((res.data.expires_in || 7200) - 300) * 1000;
    return this.accessToken;
  }

  static async sendTemplateMessage(payload: {
    templateId: string;
    data: WeChatMpTemplateData;
  }): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const openid = getWeChatMpAdminOpenId();
    const templateId = String(payload.templateId || "").trim();
    if (!openid || !templateId) return false;

    const token = await this.getAccessToken();
    const res = await axios.post<WeChatMpSendResponse>(
      `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${token}`,
      {
        touser: openid,
        template_id: templateId,
        data: payload.data,
      },
      {
        timeout: 10000,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );

    if (res.data?.errcode !== 0) {
      logger.error("公众号模板消息发送失败", {
        errcode: res.data?.errcode,
        errmsg: res.data?.errmsg,
        templateId,
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

    const templateId = getWeChatMpTemplateAdminLogin();
    if (!templateId) {
      logger.warn("公众号管理员登录通知未配置模板 ID");
      return;
    }

    try {
      await this.sendTemplateMessage({
        templateId,
        data: {
          first: { value: "Journal 管理后台登录提醒" },
          keyword1: { value: this.truncate(payload.username, 20) },
          keyword2: { value: this.formatDateTime(payload.at || new Date()) },
          keyword3: { value: this.truncate(payload.ip, 20) },
          remark: { value: "如非本人操作，请立即修改密码。" },
        },
      });
    } catch (error) {
      logger.error("公众号管理员登录通知发送异常", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  static async maybeNotifyAdminLoginFailBurst(payload: {
    username: string;
    ip: string;
  }): Promise<void> {
    if (!this.isAdminLoginFailBurstEnabled()) return;

    const templateId = getWeChatMpTemplateAdminOps();
    if (!templateId) {
      logger.warn("管理员登录失败密集通知未配置高风险操作模板 ID");
      return;
    }

    try {
      const windowMinutes = getAdminLoginFailWindowMinutes();
      const threshold = getAdminLoginFailThreshold();
      const stats = await AlertMetricService.aggregateMetricWindow(
        "login_admin",
        windowMinutes,
      );
      const now = Date.now();
      const cooldownMs = windowMinutes * 60 * 1000;
      const shouldNotify = shouldNotifyAdminLoginFailBurst({
        failCount: stats.failCount,
        threshold,
        lastNotifyAt: this.lastAdminLoginFailBurstNotifyAt,
        now,
        cooldownMs,
      });
      if (!shouldNotify) return;

      await this.sendTemplateMessage({
        templateId,
        data: {
          first: { value: "Journal 高风险操作" },
          keyword1: { value: "登录失败密集" },
          keyword2: { value: this.truncate(payload.username, 20) },
          keyword3: { value: this.truncate(payload.ip, 20) },
          keyword4: {
            value: formatAdminLoginFailBurstSummary(stats.failCount, windowMinutes),
          },
          remark: { value: defaultHighRiskRemark("登录失败密集") },
        },
      });
      this.lastAdminLoginFailBurstNotifyAt = now;
    } catch (error) {
      logger.error("管理员登录失败密集通知发送异常", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  static async notifyHighRiskOp(payload: {
    opType: string;
    operator: string;
    target: string;
    summary: string;
    remark?: string;
  }): Promise<void> {
    if (!this.isAdminOpsEnabled()) return;

    const templateId = getWeChatMpTemplateAdminOps();
    if (!templateId) {
      logger.warn("公众号高风险操作通知未配置模板 ID");
      return;
    }

    try {
      await this.sendTemplateMessage({
        templateId,
        data: {
          first: { value: "Journal 高风险操作" },
          keyword1: { value: this.truncate(payload.opType, 20) },
          keyword2: { value: this.truncate(payload.operator, 20) },
          keyword3: { value: this.truncate(payload.target, 20) },
          keyword4: { value: this.truncate(payload.summary, 20) },
          remark: {
            value: payload.remark || defaultHighRiskRemark(payload.opType),
          },
        },
      });
    } catch (error) {
      logger.error("公众号高风险操作通知发送异常", {
        opType: payload.opType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  static async notifyAlert(payload: {
    ruleName: string;
    severity: string;
    triggeredAt: Date;
    detail: string;
  }): Promise<void> {
    if (!this.isAlertEnabled()) return;

    const templateId = getWeChatMpTemplateAlert();
    if (!templateId) {
      logger.warn("公众号告警通知未配置模板 ID");
      return;
    }

    try {
      await this.sendTemplateMessage({
        templateId,
        data: {
          first: { value: "Journal 系统异常告警" },
          keyword1: { value: this.truncate(payload.ruleName, 20) },
          keyword2: { value: this.truncate(payload.severity, 20) },
          keyword3: { value: this.formatDateTime(payload.triggeredAt) },
          keyword4: { value: this.truncate(payload.detail, 20) },
          remark: { value: "请登录管理后台处理。" },
        },
      });
    } catch (error) {
      logger.error("公众号告警通知发送异常", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** @internal test helper */
  static resetTokenCacheForTest(): void {
    this.accessToken = "";
    this.tokenExpiresAt = 0;
    this.lastAdminLoginFailBurstNotifyAt = null;
  }
}
