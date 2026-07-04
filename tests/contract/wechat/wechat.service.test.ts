import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WeChatService } from "../../../src/service/wechat.service";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("contract: WeChatService", () => {
  beforeEach(() => {
    (WeChatService as any).accessToken = "";
    (WeChatService as any).tokenExpiresAt = 0;
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
  });

  it("validateTemplate 使用 mock axios 不发起真实 HTTP", async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({
        data: { access_token: "mock-token", expires_in: 7200 },
      } as never)
      .mockResolvedValueOnce({
        data: {
          errcode: 0,
          data: [{ priTmplId: "tmpl-001" }],
        },
      } as never);

    const ok = await WeChatService.validateTemplate("tmpl-001");

    expect(ok).toBe(true);
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(axios.get).mock.calls[0][0])).toContain(
      "api.weixin.qq.com",
    );
  });

  it("validateTemplate 模板不存在时返回 false", async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({
        data: { access_token: "mock-token", expires_in: 7200 },
      } as never)
      .mockResolvedValueOnce({
        data: { errcode: 0, data: [{ priTmplId: "other" }] },
      } as never);

    const ok = await WeChatService.validateTemplate("tmpl-missing");
    expect(ok).toBe(false);
  });
});
