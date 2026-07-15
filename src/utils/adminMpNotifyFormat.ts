import { IAlertRule } from "../model/AlertRule";
import { PointsRulesPayload } from "../service/points.service";

function truncate(value: string, maxLength: number): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLength) return trimmed;
  if (maxLength <= 1) return trimmed.slice(0, maxLength);
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export function tailId(id: string, len = 6): string {
  const trimmed = String(id || "").trim();
  if (!trimmed) return "unknown";
  if (trimmed.length <= len) return trimmed;
  return `…${trimmed.slice(-len)}`;
}

export function formatMigrationTarget(source: string, target: string): string {
  return truncate(`源→目标(${tailId(source)}→${tailId(target)})`, 20);
}

export function formatMigrationSummary(
  taskId: string,
  status?: string,
  idempotent?: boolean,
): string {
  if (idempotent) return "幂等命中已成功";
  const shortId = taskId.length > 10 ? `…${taskId.slice(-10)}` : taskId;
  const statusText = status || "已提交";
  return truncate(`任务${shortId} ${statusText}`, 20);
}

export function formatPurgeSummary(opts: { dryRun: boolean; withCos: boolean }): string {
  if (opts.dryRun) return "预检 dryRun";
  return opts.withCos ? "正式删 withCos" : "正式删 无COS";
}

export function describeAdminUpdate(body: {
  password?: string;
  allowedPages?: string[];
  disabled?: boolean;
}): string {
  if (body.disabled === true) return "禁用管理员";
  if (body.disabled === false) return "启用管理员";
  if (body.password !== undefined) return "管理员改密";
  if (body.allowedPages !== undefined) return "管理员改权限";
  return "管理员更新";
}

export function describeAdminUpdateSummary(body: {
  password?: string;
  allowedPages?: string[];
  disabled?: boolean;
}): string {
  if (body.disabled === true) return "disabled=true";
  if (body.disabled === false) return "disabled=false";
  if (body.password !== undefined) return "密码已更新";
  if (body.allowedPages !== undefined) {
    return truncate(`pages:${body.allowedPages.length}项`, 20);
  }
  return "已更新";
}

export type QuotaLimitsSnapshot = {
  uploadDailyBaseLimit: number;
  aiDailyBaseLimit: number;
};

export function hasQuotaChange(prev: QuotaLimitsSnapshot, next: QuotaLimitsSnapshot): boolean {
  return (
    prev.uploadDailyBaseLimit !== next.uploadDailyBaseLimit
    || prev.aiDailyBaseLimit !== next.aiDailyBaseLimit
  );
}

export function formatQuotaChange(prev: QuotaLimitsSnapshot, next: QuotaLimitsSnapshot): string {
  const parts: string[] = [];
  if (prev.aiDailyBaseLimit !== next.aiDailyBaseLimit) {
    parts.push(`AI ${prev.aiDailyBaseLimit}→${next.aiDailyBaseLimit}`);
  }
  if (prev.uploadDailyBaseLimit !== next.uploadDailyBaseLimit) {
    parts.push(`上传${prev.uploadDailyBaseLimit}→${next.uploadDailyBaseLimit}`);
  }
  return truncate(parts.join(" ") || "无变更", 20);
}

export function hasPointsRulesChange(prev: PointsRulesPayload, next: PointsRulesPayload): boolean {
  return JSON.stringify(prev) !== JSON.stringify(next);
}

export function formatPointsRulesChange(prev: PointsRulesPayload, next: PointsRulesPayload): string {
  const parts: string[] = [];
  if (prev.pointsPerAd !== next.pointsPerAd) {
    parts.push(`广告分${prev.pointsPerAd}→${next.pointsPerAd}`);
  }
  if (prev.globalAdDailyLimit !== next.globalAdDailyLimit) {
    parts.push(`日限${prev.globalAdDailyLimit}→${next.globalAdDailyLimit}`);
  }
  if (prev.uploadExchange.enabled !== next.uploadExchange.enabled) {
    parts.push(`上传兑换${next.uploadExchange.enabled ? "开" : "关"}`);
  }
  if (prev.aiExchange.enabled !== next.aiExchange.enabled) {
    parts.push(`AI兑换${next.aiExchange.enabled ? "开" : "关"}`);
  }
  return truncate(parts.join(" ") || "规则已更新", 20);
}

export function formatAlertToggleSummary(enabled: boolean): string {
  return enabled ? "已启用" : "已禁用";
}

export function formatAlertRulePatch(
  prev: IAlertRule | null,
  patch: Partial<{
    enabled: boolean;
    severity: string;
    thresholdValue: number;
    recoverValue: number;
    windowMinutes: number;
  }>,
): string {
  const parts: string[] = [];
  if (prev && patch.thresholdValue !== undefined && prev.thresholdValue !== patch.thresholdValue) {
    parts.push(`阈值${prev.thresholdValue}→${patch.thresholdValue}`);
  }
  if (prev && patch.enabled !== undefined && prev.enabled !== patch.enabled) {
    parts.push(patch.enabled ? "启用" : "禁用");
  }
  if (prev && patch.severity !== undefined && prev.severity !== patch.severity) {
    parts.push(`级别${prev.severity}→${patch.severity}`);
  }
  if (prev && patch.recoverValue !== undefined && prev.recoverValue !== patch.recoverValue) {
    parts.push(`恢复${prev.recoverValue}→${patch.recoverValue}`);
  }
  if (prev && patch.windowMinutes !== undefined && prev.windowMinutes !== patch.windowMinutes) {
    parts.push(`窗口${prev.windowMinutes}→${patch.windowMinutes}`);
  }
  return truncate(parts.join(" ") || "规则已更新", 20);
}

export function hasAlertRulePatchChange(
  prev: IAlertRule | null,
  patch: Partial<{
    enabled: boolean;
    severity: string;
    thresholdValue: number;
    recoverValue: number;
    windowMinutes: number;
  }>,
): boolean {
  return formatAlertRulePatch(prev, patch) !== "规则已更新" || Object.keys(patch).length > 0;
}

export function defaultHighRiskRemark(opType: string): string {
  if (opType.includes("登录失败")) {
    return "疑似撞库或暴力破解，请检查管理员账号安全。";
  }
  if (opType.includes("迁徙")) {
    return "请登录管理后台查看迁徙任务进度。";
  }
  if (opType.includes("删除") && opType.includes("用户")) {
    return "不可恢复，请确认是否为本人操作。";
  }
  if (opType.includes("管理员")) {
    return "若未授权请立即检查管理员列表。";
  }
  if (opType.includes("额度")) {
    return "变更已生效，请关注用量与成本。";
  }
  if (opType.includes("积分")) {
    return "请核对积分流水是否异常。";
  }
  if (opType.includes("告警规则关闭")) {
    return "关闭告警可能导致故障无人知晓。";
  }
  if (opType.includes("告警")) {
    return "请确认告警策略符合当前运维预期。";
  }
  return "请登录管理后台核对操作记录。";
}

export function shouldNotifyAdminLoginFailBurst(params: {
  failCount: number;
  threshold: number;
  lastNotifyAt: number | null;
  now: number;
  cooldownMs: number;
}): boolean {
  if (params.failCount < params.threshold) return false;
  if (params.failCount === params.threshold) return true;
  if (!params.lastNotifyAt) return true;
  return params.now - params.lastNotifyAt >= params.cooldownMs;
}

export function formatAdminLoginFailBurstSummary(
  failCount: number,
  windowMinutes: number,
): string {
  return truncate(`${windowMinutes}分钟失败${failCount}次`, 20);
}
