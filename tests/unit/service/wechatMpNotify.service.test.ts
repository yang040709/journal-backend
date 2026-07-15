import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertMetricService } from "../../../src/service/alertMetric.service";
import { WechatMpNotifyService } from "../../../src/service/wechatMpNotify.service";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("../../../src/service/alertMetric.service", () => ({
  AlertMetricService: {
    aggregateMetricWindow: vi.fn(),
  },
}));

const ENV_KEYS = [
  "WECHAT_MP_APPID",
  "WECHAT_MP_SECRET",
  "WECHAT_MP_ADMIN_OPENID",
  "WECHAT_MP_TEMPLATE_ADMIN_LOGIN",
  "WECHAT_MP_TEMPLATE_ALERT",
  "WECHAT_MP_TEMPLATE_ADMIN_OPS",
  "WECHAT_MP_NOTIFY_ENABLED",
  "WECHAT_MP_NOTIFY_ADMIN_LOGIN",
  "WECHAT_MP_NOTIFY_ALERT",
  "WECHAT_MP_NOTIFY_ADMIN_OPS",
  "WECHAT_MP_NOTIFY_ADMIN_LOGIN_FAIL",
  "WECHAT_MP_ADMIN_LOGIN_FAIL_WINDOW_MINUTES",
  "WECHAT_MP_ADMIN_LOGIN_FAIL_THRESHOLD",
] as const;

describe("unit: WechatMpNotifyService", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    ENV_KEYS.forEach((key) => {
      originalEnv[key] = process.env[key];
    });
    WechatMpNotifyService.resetTokenCacheForTest();
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
    vi.mocked(AlertMetricService.aggregateMetricWindow).mockReset();
  });

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
    WechatMpNotifyService.resetTokenCacheForTest();
  });

  function enableWechatMpEnv(overrides: Record<string, string> = {}): void {
    process.env.WECHAT_MP_APPID = "wx_test_appid";
    process.env.WECHAT_MP_SECRET = "test_secret";
    process.env.WECHAT_MP_ADMIN_OPENID = "oued_3L2LX-sBlvaqgJIh9zOtOGA";
    process.env.WECHAT_MP_TEMPLATE_ADMIN_LOGIN = "tmpl-login";
    process.env.WECHAT_MP_TEMPLATE_ALERT = "tmpl-alert";
    process.env.WECHAT_MP_TEMPLATE_ADMIN_OPS = "tmpl-admin-ops";
    process.env.WECHAT_MP_NOTIFY_ENABLED = "true";
    process.env.WECHAT_MP_NOTIFY_ADMIN_LOGIN = "true";
    process.env.WECHAT_MP_NOTIFY_ALERT = "true";
    process.env.WECHAT_MP_NOTIFY_ADMIN_OPS = "true";
    Object.entries(overrides).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }

  it("未配置 env 时 notifyAdminLogin 不发起 HTTP", async () => {
    await WechatMpNotifyService.notifyAdminLogin({
      username: "admin",
      ip: "127.0.0.1",
    });

    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("配置齐全时发送管理员登录模板消息", async () => {
    enableWechatMpEnv();
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { access_token: "mock-token", expires_in: 7200 },
    } as never);
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { errcode: 0, errmsg: "ok", msgid: 1 },
    } as never);

    await WechatMpNotifyService.notifyAdminLogin({
      username: "admin",
      ip: "127.0.0.1",
      at: new Date("2026-07-07T06:30:00.000Z"),
    });

    expect(axios.get).toHaveBeenCalledOnce();
    expect(axios.post).toHaveBeenCalledOnce();
    const postBody = vi.mocked(axios.post).mock.calls[0][1] as {
      touser: string;
      template_id: string;
      data: Record<string, { value: string }>;
    };
    expect(postBody.touser).toBe("oued_3L2LX-sBlvaqgJIh9zOtOGA");
    expect(postBody.template_id).toBe("tmpl-login");
    expect(postBody.data.keyword1.value).toBe("admin");
    expect(postBody.data.keyword2.value).toBe("2026-07-07 14:30:00");
    expect(postBody.data.keyword3.value).toBe("127.0.0.1");
    expect(postBody).not.toHaveProperty("url");
  });

  it("token 缓存后第二次 notifyAlert 不重复 GET token", async () => {
    enableWechatMpEnv();
    vi.mocked(axios.get).mockResolvedValue({
      data: { access_token: "mock-token", expires_in: 7200 },
    } as never);
    vi.mocked(axios.post).mockResolvedValue({
      data: { errcode: 0, errmsg: "ok", msgid: 1 },
    } as never);

    await WechatMpNotifyService.notifyAlert({
      ruleName: "COS 失败率上升",
      severity: "P1",
      triggeredAt: new Date("2026-07-07T06:35:00.000Z"),
      detail: "失败率 18.5%",
    });
    await WechatMpNotifyService.notifyAlert({
      ruleName: "登录异常",
      severity: "P2",
      triggeredAt: new Date("2026-07-07T06:36:00.000Z"),
      detail: "命中率 25.0%",
    });

    expect(axios.get).toHaveBeenCalledOnce();
    expect(axios.post).toHaveBeenCalledTimes(2);
    const postBody = vi.mocked(axios.post).mock.calls[0][1] as {
      template_id: string;
      data: Record<string, { value: string }>;
    };
    expect(postBody.template_id).toBe("tmpl-alert");
    expect(postBody.data.keyword1.value).toBe("COS 失败率上升");
    expect(postBody.data.keyword2.value).toBe("P1");
  });

  it("truncate 会将超长字段截断到 20 字内", () => {
    const longText = "这是一个非常非常非常非常非常非常长的用户名";
    expect(WechatMpNotifyService.truncate(longText, 20).length).toBeLessThanOrEqual(20);
    expect(WechatMpNotifyService.truncate(longText, 20).endsWith("…")).toBe(true);
  });

  it("WECHAT_MP_NOTIFY_ADMIN_LOGIN=false 时不发送登录通知", async () => {
    enableWechatMpEnv({ WECHAT_MP_NOTIFY_ADMIN_LOGIN: "false" });

    await WechatMpNotifyService.notifyAdminLogin({
      username: "admin",
      ip: "127.0.0.1",
    });

    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("未开启 WECHAT_MP_NOTIFY_ADMIN_OPS 时不发送高风险操作通知", async () => {
    enableWechatMpEnv({ WECHAT_MP_NOTIFY_ADMIN_OPS: "false" });

    await WechatMpNotifyService.notifyHighRiskOp({
      opType: "额度上限修改",
      operator: "admin",
      target: "全员基础额度",
      summary: "AI 10→20",
    });

    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("配置齐全时发送高风险操作模板消息", async () => {
    enableWechatMpEnv();
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { access_token: "mock-token", expires_in: 7200 },
    } as never);
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { errcode: 0, errmsg: "ok", msgid: 1 },
    } as never);

    await WechatMpNotifyService.notifyHighRiskOp({
      opType: "额度上限修改",
      operator: "admin",
      target: "全员基础额度",
      summary: "AI 10→20 上传5→8",
    });

    expect(axios.get).toHaveBeenCalledOnce();
    expect(axios.post).toHaveBeenCalledOnce();
    const postBody = vi.mocked(axios.post).mock.calls[0][1] as {
      template_id: string;
      data: Record<string, { value: string }>;
    };
    expect(postBody.template_id).toBe("tmpl-admin-ops");
    expect(postBody.data.first.value).toBe("Journal 高风险操作");
    expect(postBody.data.keyword1.value).toBe("额度上限修改");
    expect(postBody.data.keyword2.value).toBe("admin");
    expect(postBody.data.keyword3.value).toBe("全员基础额度");
    expect(postBody.data.keyword4.value).toBe("AI 10→20 上传5→8");
    expect(postBody.data.remark.value).toContain("用量");
  });

  it("未开启 WECHAT_MP_NOTIFY_ADMIN_LOGIN_FAIL 时不发送密集失败通知", async () => {
    enableWechatMpEnv({ WECHAT_MP_NOTIFY_ADMIN_LOGIN_FAIL: "false" });
    vi.mocked(AlertMetricService.aggregateMetricWindow).mockResolvedValue({
      successCount: 0,
      failCount: 10,
      totalCount: 10,
    });

    await WechatMpNotifyService.maybeNotifyAdminLoginFailBurst({
      username: "admin",
      ip: "127.0.0.1",
    });

    expect(AlertMetricService.aggregateMetricWindow).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("5 分钟内失败未达阈值时不推送", async () => {
    enableWechatMpEnv({ WECHAT_MP_NOTIFY_ADMIN_LOGIN_FAIL: "true" });
    vi.mocked(AlertMetricService.aggregateMetricWindow).mockResolvedValue({
      successCount: 0,
      failCount: 3,
      totalCount: 3,
    });

    await WechatMpNotifyService.maybeNotifyAdminLoginFailBurst({
      username: "admin",
      ip: "127.0.0.1",
    });

    expect(AlertMetricService.aggregateMetricWindow).toHaveBeenCalledWith(
      "login_admin",
      5,
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("达到阈值时发送登录失败密集通知", async () => {
    enableWechatMpEnv({ WECHAT_MP_NOTIFY_ADMIN_LOGIN_FAIL: "true" });
    vi.mocked(AlertMetricService.aggregateMetricWindow).mockResolvedValue({
      successCount: 0,
      failCount: 5,
      totalCount: 5,
    });
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { access_token: "mock-token", expires_in: 7200 },
    } as never);
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { errcode: 0, errmsg: "ok", msgid: 1 },
    } as never);

    await WechatMpNotifyService.maybeNotifyAdminLoginFailBurst({
      username: "admin",
      ip: "127.0.0.1",
    });

    expect(axios.post).toHaveBeenCalledOnce();
    const postBody = vi.mocked(axios.post).mock.calls[0][1] as {
      template_id: string;
      data: Record<string, { value: string }>;
    };
    expect(postBody.template_id).toBe("tmpl-admin-ops");
    expect(postBody.data.keyword1.value).toBe("登录失败密集");
    expect(postBody.data.keyword2.value).toBe("admin");
    expect(postBody.data.keyword3.value).toBe("127.0.0.1");
    expect(postBody.data.keyword4.value).toBe("5分钟失败5次");
    expect(postBody.data.remark.value).toContain("暴力破解");
  });

  it("冷却期内超过阈值不重复推送", async () => {
    enableWechatMpEnv({ WECHAT_MP_NOTIFY_ADMIN_LOGIN_FAIL: "true" });
    vi.mocked(AlertMetricService.aggregateMetricWindow).mockResolvedValue({
      successCount: 0,
      failCount: 8,
      totalCount: 8,
    });
    vi.mocked(axios.get).mockResolvedValue({
      data: { access_token: "mock-token", expires_in: 7200 },
    } as never);
    vi.mocked(axios.post).mockResolvedValue({
      data: { errcode: 0, errmsg: "ok", msgid: 1 },
    } as never);

    await WechatMpNotifyService.maybeNotifyAdminLoginFailBurst({
      username: "admin",
      ip: "127.0.0.1",
    });
    await WechatMpNotifyService.maybeNotifyAdminLoginFailBurst({
      username: "admin",
      ip: "127.0.0.1",
    });

    expect(axios.post).toHaveBeenCalledOnce();
  });
});
