import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertNotifyService } from "../../../src/service/alertNotify.service";
import { WechatMpNotifyService } from "../../../src/service/wechatMpNotify.service";

vi.mock("../../../src/service/wechatMpNotify.service", () => ({
  WechatMpNotifyService: {
    notifyAlert: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("unit: AlertNotifyService", () => {
  beforeEach(() => {
    vi.mocked(WechatMpNotifyService.notifyAlert).mockClear();
  });

  it("notifyNewEvent 会格式化告警并调用公众号通知", async () => {
    const triggeredAt = new Date("2026-07-07T06:35:00.000Z");

    await AlertNotifyService.notifyNewEvent({
      ruleName: "COS 失败率上升",
      severity: "P1",
      triggeredAt,
      hitValue: 0.185,
      ruleKey: "cos_failure_rate_rise",
    } as never);

    expect(WechatMpNotifyService.notifyAlert).toHaveBeenCalledOnce();
    expect(WechatMpNotifyService.notifyAlert).toHaveBeenCalledWith({
      ruleName: "COS 失败率上升",
      severity: "P1",
      triggeredAt,
      detail: "命中率 18.5%",
    });
  });

  it("export_spike 规则使用放量倍数摘要", async () => {
    const triggeredAt = new Date("2026-07-07T06:40:00.000Z");

    await AlertNotifyService.notifyNewEvent({
      ruleName: "导出激增",
      severity: "P2",
      triggeredAt,
      hitValue: 3.2,
      ruleKey: "export_spike",
    } as never);

    expect(WechatMpNotifyService.notifyAlert).toHaveBeenCalledWith({
      ruleName: "导出激增",
      severity: "P2",
      triggeredAt,
      detail: "放量倍数 3.2x",
    });
  });
});
