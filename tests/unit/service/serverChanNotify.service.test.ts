import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServerChanNotifyService } from "../../../src/service/serverChanNotify.service";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

const ENV_KEYS = [
  "SERVERCHAN_SENDKEY",
  "SERVERCHAN_NOTIFY_ENABLED",
  "SERVERCHAN_NOTIFY_ADMIN_LOGIN",
  "SERVERCHAN_CHANNEL",
] as const;

const TEST_SENDKEY = "SCTtest1234567890abcdef";

describe("unit: ServerChanNotifyService", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    ENV_KEYS.forEach((key) => {
      originalEnv[key] = process.env[key];
    });
    vi.mocked(axios.post).mockReset();
  });

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  function enableServerChanEnv(overrides: Record<string, string> = {}): void {
    process.env.SERVERCHAN_SENDKEY = TEST_SENDKEY;
    process.env.SERVERCHAN_NOTIFY_ENABLED = "true";
    process.env.SERVERCHAN_NOTIFY_ADMIN_LOGIN = "true";
    delete process.env.SERVERCHAN_CHANNEL;
    Object.entries(overrides).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }

  it("未配置 env 时 notifyAdminLogin 不发起 HTTP", async () => {
    await ServerChanNotifyService.notifyAdminLogin({
      username: "admin",
      ip: "127.0.0.1",
    });

    expect(axios.post).not.toHaveBeenCalled();
  });

  it("配置齐全时发送管理员登录 Server酱 推送", async () => {
    enableServerChanEnv();
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { code: 0, message: "success" },
    } as never);

    await ServerChanNotifyService.notifyAdminLogin({
      username: "admin",
      ip: "127.0.0.1",
      at: new Date("2026-07-07T06:30:00.000Z"),
    });

    expect(axios.post).toHaveBeenCalledOnce();
    const [url, body, config] = vi.mocked(axios.post).mock.calls[0];
    expect(url).toBe(`https://sctapi.ftqq.com/${TEST_SENDKEY}.send`);
    expect(body).toMatchObject({
      title: "Journal 管理后台登录提醒",
    });
    expect((body as { desp: string }).desp).toContain("**账号**：admin");
    expect((body as { desp: string }).desp).toContain("**时间**：2026-07-07 14:30:00");
    expect((body as { desp: string }).desp).toContain("**IP**：127.0.0.1");
    expect(body).not.toHaveProperty("channel");
    expect(config).toMatchObject({
      timeout: 10000,
      headers: { "Content-Type": "application/json;charset=utf-8" },
    });
  });

  it("配置 SERVERCHAN_CHANNEL 时附带 channel 参数", async () => {
    enableServerChanEnv({ SERVERCHAN_CHANNEL: "9|0" });
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { code: 0, message: "success" },
    } as never);

    await ServerChanNotifyService.notifyAdminLogin({
      username: "admin",
      ip: "127.0.0.1",
    });

    const body = vi.mocked(axios.post).mock.calls[0][1] as { channel: string };
    expect(body.channel).toBe("9|0");
  });

  it("SERVERCHAN_NOTIFY_ENABLED=false 时不发送登录通知", async () => {
    enableServerChanEnv({ SERVERCHAN_NOTIFY_ENABLED: "false" });

    await ServerChanNotifyService.notifyAdminLogin({
      username: "admin",
      ip: "127.0.0.1",
    });

    expect(axios.post).not.toHaveBeenCalled();
  });

  it("SERVERCHAN_NOTIFY_ADMIN_LOGIN=false 时不发送登录通知", async () => {
    enableServerChanEnv({ SERVERCHAN_NOTIFY_ADMIN_LOGIN: "false" });

    await ServerChanNotifyService.notifyAdminLogin({
      username: "admin",
      ip: "127.0.0.1",
    });

    expect(axios.post).not.toHaveBeenCalled();
  });

  it("SCT 返回 code !== 0 时不抛异常", async () => {
    enableServerChanEnv();
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { code: 40001, message: "invalid key" },
    } as never);

    await expect(
      ServerChanNotifyService.notifyAdminLogin({
        username: "admin",
        ip: "127.0.0.1",
      }),
    ).resolves.toBeUndefined();
  });

  it("网络异常时不抛异常", async () => {
    enableServerChanEnv();
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("network error"));

    await expect(
      ServerChanNotifyService.notifyAdminLogin({
        username: "admin",
        ip: "127.0.0.1",
      }),
    ).resolves.toBeUndefined();
  });
});
