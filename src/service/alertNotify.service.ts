import { IAlertEvent } from "../model/AlertEvent";
import { WechatMpNotifyService } from "./wechatMpNotify.service";

function formatHitDetail(event: IAlertEvent): string {
  const hitValue = Number(event.hitValue);
  if (!Number.isFinite(hitValue)) {
    return "命中异常";
  }

  if (event.ruleKey.includes("rate") || event.ruleKey.includes("abnormal")) {
    return `命中率 ${(hitValue * 100).toFixed(1)}%`;
  }

  if (event.ruleKey === "export_spike") {
    return `放量倍数 ${hitValue.toFixed(1)}x`;
  }

  return `命中值 ${hitValue}`;
}

export class AlertNotifyService {
  static async notifyNewEvent(event: IAlertEvent): Promise<void> {
    await WechatMpNotifyService.notifyAlert({
      ruleName: event.ruleName,
      severity: event.severity,
      triggeredAt: event.triggeredAt,
      detail: formatHitDetail(event),
    });
  }
}
