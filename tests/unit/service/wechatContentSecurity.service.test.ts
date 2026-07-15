import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("../../../src/config/wechatEnv", () => ({
  getWeChatAppId: vi.fn(() => process.env.__TEST_WX_APPID || ""),
  getWeChatSecret: vi.fn(() => process.env.__TEST_WX_SECRET || ""),
}));

import axios from "axios";
import { WeChatContentSecurityService } from "../../../src/service/wechatContentSecurity.service";

describe("unit: WeChatContentSecurityService", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
    delete process.env.__TEST_WX_APPID;
    delete process.env.__TEST_WX_SECRET;
    // reset cached token via private fields
    (WeChatContentSecurityService as unknown as { accessToken: string }).accessToken = "";
    (WeChatContentSecurityService as unknown as { tokenExpiresAt: number }).tokenExpiresAt = 0;
  });

  afterEach(() => {
    delete process.env.__TEST_WX_APPID;
    delete process.env.__TEST_WX_SECRET;
  });

  it("isConfigured / 未配置返回 retry", async () => {
    expect(WeChatContentSecurityService.isConfigured()).toBe(false);
    expect(await WeChatContentSecurityService.checkText("hi")).toMatchObject({
      decision: "retry",
      code: "WECHAT_NOT_CONFIGURED",
    });
    expect(await WeChatContentSecurityService.checkImageByUrl("https://x")).toMatchObject({
      decision: "retry",
      code: "WECHAT_NOT_CONFIGURED",
    });
  });

  it("checkText suggest 分支与 openid / token / errcode / catch", async () => {
    process.env.__TEST_WX_APPID = "app";
    process.env.__TEST_WX_SECRET = "sec";
    expect(WeChatContentSecurityService.isConfigured()).toBe(true);

    vi.mocked(axios.get).mockResolvedValue({
      data: { access_token: "tok", expires_in: 7200 },
    });

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { errcode: 0, result: { suggest: "pass", label: 100 }, trace_id: "t1" },
    });
    expect(
      await WeChatContentSecurityService.checkText("ok", "oABCDEFGHIJKLMNOPQRSTU"),
    ).toMatchObject({ decision: "pass", suggest: "pass", passed: true });

    // reuse cached token
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { errcode: 0, result: { suggest: "risky", label: 200 }, trace_id: "t2" },
    });
    expect(await WeChatContentSecurityService.checkText("risky", "bad-openid")).toMatchObject({
      decision: "pass",
      suggest: "risky",
      code: "WECHAT_TEXT_RISKY",
    });

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { errcode: 0, result: { suggest: "review" }, trace_id: "t3" },
    });
    expect(await WeChatContentSecurityService.checkText("bad")).toMatchObject({
      decision: "reject",
      suggest: "review",
    });

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { errcode: 0, result: { suggest: "other" }, trace_id: "t4" },
    });
    expect(await WeChatContentSecurityService.checkText("x")).toMatchObject({
      decision: "retry",
      code: "WECHAT_TEXT_UNKNOWN_SUGGEST",
    });

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { errcode: 40001, errmsg: "invalid", trace_id: "t5" },
    });
    expect(await WeChatContentSecurityService.checkText("x")).toMatchObject({
      decision: "retry",
      code: "WECHAT_TEXT_API_40001",
    });

    vi.mocked(axios.post).mockRejectedValueOnce(new Error("net"));
    expect(await WeChatContentSecurityService.checkText("x")).toMatchObject({
      decision: "retry",
      code: "WECHAT_TEXT_REQUEST_ERROR",
      detail: "net",
    });
  });

  it("checkImageByUrl 空图 / 成功 / errcode / catch；token 失败", async () => {
    process.env.__TEST_WX_APPID = "app";
    process.env.__TEST_WX_SECRET = "sec";
    expect(await WeChatContentSecurityService.checkImageByUrl("")).toMatchObject({
      decision: "pass",
    });

    vi.mocked(axios.get).mockResolvedValueOnce({ data: { errmsg: "no token" } });
    expect(await WeChatContentSecurityService.checkImageByUrl("https://img")).toMatchObject({
      decision: "retry",
      code: "WECHAT_IMAGE_REQUEST_ERROR",
      detail: expect.stringMatching(/token|no token/),
    });

    (WeChatContentSecurityService as unknown as { accessToken: string }).accessToken = "";
    (WeChatContentSecurityService as unknown as { tokenExpiresAt: number }).tokenExpiresAt = 0;
    vi.mocked(axios.get).mockResolvedValue({
      data: { access_token: "tok2", expires_in: 100 },
    });
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { errcode: 0, trace_id: "img1" },
    });
    expect(await WeChatContentSecurityService.checkImageByUrl("https://img")).toMatchObject({
      decision: "pass",
      traceId: "img1",
    });

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { errcode: 87014, errmsg: "risky", trace_id: "img2" },
    });
    expect(await WeChatContentSecurityService.checkImageByUrl("https://img")).toMatchObject({
      decision: "retry",
      code: "WECHAT_IMAGE_API_87014",
    });

    vi.mocked(axios.post).mockRejectedValueOnce("boom");
    expect(await WeChatContentSecurityService.checkImageByUrl("https://img")).toMatchObject({
      decision: "retry",
      code: "WECHAT_IMAGE_REQUEST_ERROR",
    });
  });
});
