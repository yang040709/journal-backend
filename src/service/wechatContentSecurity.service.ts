import axios from "axios";
import { getWeChatAppId, getWeChatSecret } from "../config/wechatEnv";

interface WeChatTokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

interface WeChatApiResponse {
  errcode?: number;
  errmsg?: string;
  trace_id?: string;
  detail?: Array<{ suggest?: string; label?: number; errcode?: number }>;
  result?: { suggest?: string; label?: number };
}

export interface WeChatSecurityResult {
  passed: boolean;
  suggest?: "pass" | "risky" | "review" | "unknown";
  label?: number;
  traceId?: string;
  code?: string;
  detail?: string;
}

const WECHAT_OPENID_PATTERN = /^o[A-Za-z0-9_-]{15,63}$/;

function normalizeOpenId(openid?: string): string | undefined {
  const value = String(openid || "").trim();
  if (!value) return undefined;
  return WECHAT_OPENID_PATTERN.test(value) ? value : undefined;
}

export class WeChatContentSecurityService {
  private static accessToken = "";
  private static tokenExpiresAt = 0;

  private static get appId(): string {
    return getWeChatAppId();
  }

  private static get appSecret(): string {
    return getWeChatSecret();
  }

  static isConfigured(): boolean {
    return Boolean(this.appId && this.appSecret);
  }

  private static async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const res = await axios.get<WeChatTokenResponse>(
      "https://api.weixin.qq.com/cgi-bin/token",
      {
        params: {
          grant_type: "client_credential",
          appid: this.appId,
          secret: this.appSecret,
        },
        timeout: 10000,
      },
    );

    if (!res.data?.access_token) {
      throw new Error(res.data?.errmsg || "获取微信 access_token 失败");
    }

    this.accessToken = res.data.access_token;
    this.tokenExpiresAt = Date.now() + ((res.data.expires_in || 7200) - 300) * 1000;
    return this.accessToken;
  }

  static async checkText(content: string, openid?: string): Promise<WeChatSecurityResult> {
    if (!this.isConfigured()) {
      return { passed: false, code: "WECHAT_NOT_CONFIGURED", detail: "微信风控未配置" };
    }

    try {
      const accessToken = await this.getAccessToken();
      const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${accessToken}`;
      const validOpenId = normalizeOpenId(openid);
      const res = await axios.post<WeChatApiResponse>(
        url,
        {
          content: String(content || "").slice(0, 20000),
          version: 2,
          scene: 2,
          ...(validOpenId ? { openid: validOpenId } : {}),
        },
        { timeout: 10000 },
      );

      if (res.data?.errcode && res.data.errcode !== 0) {
        return {
          passed: false,
          traceId: res.data.trace_id,
          code: `WECHAT_TEXT_API_${res.data.errcode}`,
          detail: res.data.errmsg || "微信文本检测失败",
        };
      }

      const suggest = res.data?.result?.suggest;
      const label = res.data?.result?.label;
      if (suggest === "pass") {
        return { passed: true, suggest: "pass", label, traceId: res.data?.trace_id };
      }
      if (suggest === "risky") {
        return {
          passed: true,
          suggest: "risky",
          label,
          traceId: res.data?.trace_id,
          code: "WECHAT_TEXT_RISKY",
          detail: "suggest=risky",
        };
      }
      if (suggest === "review") {
        return {
          passed: false,
          suggest: "review",
          label,
          traceId: res.data?.trace_id,
          code: "WECHAT_TEXT_REJECT",
          detail: "suggest=review",
        };
      }
      return {
        passed: false,
        suggest: "unknown",
        label,
        traceId: res.data?.trace_id,
        code: "WECHAT_TEXT_REJECT",
        detail: `suggest=${suggest || "unknown"}`,
      };
    } catch (e) {
      return {
        passed: false,
        code: "WECHAT_TEXT_REQUEST_ERROR",
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  static async checkImageByUrl(imageUrl: string): Promise<WeChatSecurityResult> {
    if (!this.isConfigured()) {
      return { passed: false, code: "WECHAT_NOT_CONFIGURED", detail: "微信风控未配置" };
    }
    if (!imageUrl) {
      return { passed: true };
    }

    try {
      const accessToken = await this.getAccessToken();
      const url = `https://api.weixin.qq.com/wxa/media_check_async?access_token=${accessToken}`;
      const res = await axios.post<WeChatApiResponse>(
        url,
        { media_url: imageUrl, version: 2, scene: 2 },
        { timeout: 10000 },
      );

      if (res.data?.errcode && res.data.errcode !== 0) {
        return {
          passed: false,
          traceId: res.data.trace_id,
          code: `WECHAT_IMAGE_API_${res.data.errcode}`,
          detail: res.data.errmsg || "微信图片检测失败",
        };
      }

      // 异步接口通常返回受理成功（errcode=0），这里按通过处理，后续可接回调做更精细决策
      return { passed: true, traceId: res.data?.trace_id };
    } catch (e) {
      return {
        passed: false,
        code: "WECHAT_IMAGE_REQUEST_ERROR",
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
