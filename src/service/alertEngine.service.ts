import AlertEvent from "../model/AlertEvent";
import AlertRule, { IAlertRule } from "../model/AlertRule";
import { logger } from "../utils/logger";
import { AlertMetricService } from "./alertMetric.service";

type EvaluationResult = {
  breached: boolean;
  sampleCount: number;
  value: number;
  baselineValue?: number;
  snapshot: Record<string, unknown>;
};

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function makeEventId(ruleKey: string): string {
  return `alevt_${ruleKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function subMinutes(input: Date, minutes: number): Date {
  return new Date(input.getTime() - Math.max(0, minutes) * 60 * 1000);
}

export class AlertEngineService {
  static async evaluateAllRules(): Promise<void> {
    const rules = await AlertRule.find({ enabled: true }).sort({ severity: 1, ruleKey: 1 });
    await Promise.all(
      rules.map(async (rule) => {
        try {
          await AlertEngineService.evaluateRule(rule, new Date());
        } catch (error) {
          logger.error("告警规则评估失败", {
            ruleKey: rule.ruleKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }

  private static async evaluateRule(rule: IAlertRule, now: Date): Promise<void> {
    const result = await AlertEngineService.runRuleEvaluation(rule, now);
    const stats = rule.stats || { hitStreak: 0, recoverStreak: 0 };
    stats.lastEvaluatedAt = now;
    stats.lastValue = result.value;
    stats.lastBaseline = result.baselineValue;
    const recoverThreshold = rule.recoverValue ?? rule.thresholdValue * 0.8;
    const unresolved = await AlertEvent.findOne({
      ruleKey: rule.ruleKey,
      status: { $in: ["open", "acknowledged"] },
    }).sort({ triggeredAt: -1 });

    if (result.breached) {
      stats.hitStreak = (stats.hitStreak || 0) + 1;
      stats.recoverStreak = 0;
      const cooldownFrom =
        stats.lastTriggeredAt && rule.cooldownMinutes > 0
          ? subMinutes(now, rule.cooldownMinutes)
          : null;
      const inCooldown = Boolean(cooldownFrom && stats.lastTriggeredAt && stats.lastTriggeredAt > cooldownFrom);
      const canTrigger = stats.hitStreak >= Math.max(1, rule.consecutiveHits) && !inCooldown;

      if (canTrigger) {
        if (unresolved) {
          unresolved.occurrenceCount = Math.max(1, unresolved.occurrenceCount || 1) + 1;
          unresolved.lastHitAt = now;
          unresolved.hitValue = result.value;
          unresolved.baselineValue = result.baselineValue;
          unresolved.metricSnapshot = result.snapshot;
          await unresolved.save();
        } else {
          await AlertEvent.create({
            eventId: makeEventId(rule.ruleKey),
            ruleKey: rule.ruleKey,
            ruleName: rule.name,
            severity: rule.severity,
            status: "open",
            triggeredAt: now,
            lastHitAt: now,
            hitValue: result.value,
            baselineValue: result.baselineValue,
            metricSnapshot: result.snapshot,
            occurrenceCount: 1,
          });
        }
        stats.lastTriggeredAt = now;
      }
    } else {
      stats.hitStreak = 0;
      if (unresolved && result.value <= recoverThreshold) {
        stats.recoverStreak = (stats.recoverStreak || 0) + 1;
        if (stats.recoverStreak >= 2) {
          unresolved.status = "resolved";
          unresolved.resolvedAt = now;
          unresolved.lastHitAt = now;
          unresolved.metricSnapshot = result.snapshot;
          await unresolved.save();
          stats.recoverStreak = 0;
        }
      } else {
        stats.recoverStreak = 0;
      }
    }
    rule.stats = stats;
    await rule.save();
  }

  private static async runRuleEvaluation(rule: IAlertRule, now: Date): Promise<EvaluationResult> {
    const params = (rule.params || {}) as Record<string, unknown>;
    if (rule.ruleKey === "auth_login_abnormal") {
      const [authStats, adminStats] = await Promise.all([
        AlertMetricService.aggregateMetricWindow("login_auth", rule.windowMinutes, now),
        AlertMetricService.aggregateMetricWindow("login_admin", rule.windowMinutes, now),
      ]);
      const total = authStats.totalCount + adminStats.totalCount;
      const fail = authStats.failCount + adminStats.failCount;
      const failRate = total > 0 ? fail / total : 0;
      const failCountBreached = fail >= toNumber(params.secondaryFailCountThreshold, 20);
      const rateBreached = total >= rule.minSampleCount && failRate >= rule.thresholdValue;
      return {
        breached: Boolean(rateBreached || failCountBreached),
        sampleCount: total,
        value: failRate,
        snapshot: {
          total,
          fail,
          failRate,
          auth: authStats,
          admin: adminStats,
        },
      };
    }

    if (rule.ruleKey === "cos_failure_rate_rise") {
      const cosStats = await AlertMetricService.aggregateMetricWindow("cos_sts", rule.windowMinutes, now);
      const failRate = cosStats.totalCount > 0 ? cosStats.failCount / cosStats.totalCount : 0;
      const failCountBreached = cosStats.failCount >= toNumber(params.secondaryInternalFailThreshold, 10);
      const rateBreached = cosStats.totalCount >= rule.minSampleCount && failRate >= rule.thresholdValue;
      return {
        breached: Boolean(rateBreached || failCountBreached),
        sampleCount: cosStats.totalCount,
        value: failRate,
        snapshot: {
          ...cosStats,
          failRate,
        },
      };
    }

    if (rule.ruleKey === "export_spike") {
      const current = await AlertMetricService.getExportWindowStats(rule.windowMinutes, now);
      const baseline = await AlertMetricService.getExportBaselineTotal(rule.windowMinutes, 7, now);
      const ratio = baseline > 0 ? current.totalCount / baseline : 0;
      const ratioBreached = current.totalCount >= toNumber(params.minTotalThreshold, 80) && ratio >= rule.thresholdValue;
      const failBreached = current.failCount >= toNumber(params.secondaryFailCountThreshold, 15);
      return {
        breached: Boolean(ratioBreached || failBreached),
        sampleCount: current.totalCount,
        value: ratio,
        baselineValue: baseline,
        snapshot: {
          current,
          baseline,
          ratio,
        },
      };
    }

    if (rule.ruleKey === "migration_failed") {
      const stats = await AlertMetricService.getMigrationWindowStats(rule.windowMinutes, now);
      const immediate = stats.rollbackFailedCount >= toNumber(params.rollbackFailedImmediateThreshold, 1);
      const normal = stats.failedCount >= rule.thresholdValue;
      return {
        breached: Boolean(immediate || normal),
        sampleCount: stats.failedCount + stats.rollbackFailedCount,
        value: stats.failedCount + stats.rollbackFailedCount,
        snapshot: stats,
      };
    }

    if (rule.ruleKey === "risk_reject_rate_spike") {
      const current = await AlertMetricService.getRiskWindowStats(rule.windowMinutes, now);
      const baselineRate = await AlertMetricService.getRiskBaselineRejectRate(rule.windowMinutes, 3, now);
      const baselineRatioThreshold = toNumber(params.baselineRatioThreshold, 2);
      const rateBreached =
        current.checkedCount >= rule.minSampleCount && current.rejectRate >= rule.thresholdValue;
      const ratio = baselineRate > 0 ? current.rejectRate / baselineRate : 0;
      const ratioBreached =
        current.checkedCount >= rule.minSampleCount && baselineRate > 0 && ratio >= baselineRatioThreshold;
      return {
        breached: Boolean(rateBreached || ratioBreached),
        sampleCount: current.checkedCount,
        value: current.rejectRate,
        baselineValue: baselineRate,
        snapshot: {
          ...current,
          baselineRate,
          ratio,
        },
      };
    }

    return {
      breached: false,
      sampleCount: 0,
      value: 0,
      snapshot: {},
    };
  }
}
