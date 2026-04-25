import AlertMetricSample from "../model/AlertMetricSample";
import NoteExportLog from "../model/NoteExportLog";
import ShareSecurityTask from "../model/ShareSecurityTask";
import UserMigrationTask from "../model/UserMigrationTask";

const METRIC_RETENTION_DAYS = 30;
const ONE_MINUTE_MS = 60 * 1000;

function minuteBucketStart(input: Date = new Date()): Date {
  return new Date(Math.floor(input.getTime() / ONE_MINUTE_MS) * ONE_MINUTE_MS);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * ONE_MINUTE_MS);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * ONE_MINUTE_MS);
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function toUtcYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class AlertMetricService {
  static async recordOperation(
    metricKey: string,
    payload: {
      success: boolean;
      count?: number;
      tags?: Record<string, unknown>;
      at?: Date;
    },
  ): Promise<void> {
    const key = String(metricKey || "").trim();
    if (!key) return;
    const count = Math.max(1, Number(payload.count || 1));
    const bucketStart = minuteBucketStart(payload.at || new Date());
    const expiresAt = addDays(bucketStart, METRIC_RETENTION_DAYS);
    const inc: Record<string, number> = {
      totalCount: count,
    };
    if (payload.success) {
      inc.successCount = count;
    } else {
      inc.failCount = count;
    }
    await AlertMetricSample.updateOne(
      { metricKey: key, bucketStart },
      {
        $setOnInsert: { metricKey: key, bucketStart, expiresAt },
        $set: payload.tags ? { tags: payload.tags } : {},
        $inc: inc,
      },
      { upsert: true },
    );
  }

  static async aggregateMetricWindow(
    metricKey: string,
    windowMinutes: number,
    now = new Date(),
  ): Promise<{ successCount: number; failCount: number; totalCount: number }> {
    const key = String(metricKey || "").trim();
    if (!key) {
      return { successCount: 0, failCount: 0, totalCount: 0 };
    }
    const from = addMinutes(now, -Math.max(1, windowMinutes));
    const rows = await AlertMetricSample.aggregate<{
      successCount: number;
      failCount: number;
      totalCount: number;
    }>([
      {
        $match: {
          metricKey: key,
          bucketStart: { $gte: from, $lte: now },
        },
      },
      {
        $group: {
          _id: null,
          successCount: { $sum: "$successCount" },
          failCount: { $sum: "$failCount" },
          totalCount: { $sum: "$totalCount" },
        },
      },
    ]);
    return rows[0] || { successCount: 0, failCount: 0, totalCount: 0 };
  }

  static async getMigrationWindowStats(windowMinutes: number, now = new Date()) {
    const from = addMinutes(now, -Math.max(1, windowMinutes));
    const [failedCount, rollbackFailedCount] = await Promise.all([
      UserMigrationTask.countDocuments({
        status: "failed",
        updatedAt: { $gte: from, $lte: now },
      }),
      UserMigrationTask.countDocuments({
        status: "rollback_failed",
        updatedAt: { $gte: from, $lte: now },
      }),
    ]);
    return { failedCount, rollbackFailedCount };
  }

  static async getRiskWindowStats(windowMinutes: number, now = new Date()) {
    const from = addMinutes(now, -Math.max(1, windowMinutes));
    const rows = await ShareSecurityTask.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          status: {
            $in: ["pass", "risky_wechat", "reject_local", "reject_wechat", "error"],
          },
          updatedAt: { $gte: from, $lte: now },
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    let total = 0;
    let reject = 0;
    for (const row of rows) {
      total += row.count;
      if (row._id === "reject_local" || row._id === "reject_wechat") {
        reject += row.count;
      }
    }
    const rejectRate = total > 0 ? reject / total : 0;
    return { checkedCount: total, rejectCount: reject, rejectRate };
  }

  static async getRiskBaselineRejectRate(
    _windowMinutes: number,
    lookbackDays: number,
    now = new Date(),
  ): Promise<number> {
    const days = Math.max(1, lookbackDays);
    const from = startOfUtcDay(addDays(now, -days));
    const to = startOfUtcDay(now);
    const rows = await ShareSecurityTask.aggregate<{
      _id: { day: string; status: string };
      count: number;
    }>([
      {
        $match: {
          status: { $in: ["pass", "risky_wechat", "reject_local", "reject_wechat", "error"] },
          updatedAt: { $gte: from, $lt: to },
        },
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt", timezone: "UTC" } },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const dayAgg = new Map<string, { total: number; reject: number }>();
    for (const row of rows) {
      const day = row._id.day;
      const prev = dayAgg.get(day) || { total: 0, reject: 0 };
      prev.total += row.count;
      if (row._id.status === "reject_local" || row._id.status === "reject_wechat") {
        prev.reject += row.count;
      }
      dayAgg.set(day, prev);
    }

    let totalRate = 0;
    let usedDays = 0;
    for (let i = 1; i <= days; i += 1) {
      const dayKey = toUtcYmd(addDays(now, -i));
      const stat = dayAgg.get(dayKey);
      if (stat && stat.total > 0) {
        totalRate += stat.reject / stat.total;
        usedDays += 1;
      }
    }
    return usedDays > 0 ? totalRate / usedDays : 0;
  }

  static async getExportWindowStats(windowMinutes: number, now = new Date()) {
    const from = addMinutes(now, -Math.max(1, windowMinutes));
    const [successCount, failMetric] = await Promise.all([
      NoteExportLog.countDocuments({ createdAt: { $gte: from, $lte: now } }),
      AlertMetricService.aggregateMetricWindow("export_run", windowMinutes, now),
    ]);
    const failCount = failMetric.failCount;
    return {
      successCount,
      failCount,
      totalCount: successCount + failCount,
    };
  }

  static async getExportBaselineTotal(
    _windowMinutes: number,
    lookbackDays: number,
    now = new Date(),
  ): Promise<number> {
    const days = Math.max(1, lookbackDays);
    const from = startOfUtcDay(addDays(now, -days));
    const to = startOfUtcDay(now);
    const [successRows, failRows] = await Promise.all([
      NoteExportLog.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: from, $lt: to } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
            count: { $sum: 1 },
          },
        },
      ]),
      AlertMetricSample.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            metricKey: "export_run",
            bucketStart: { $gte: from, $lt: to },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$bucketStart", timezone: "UTC" } },
            count: { $sum: "$failCount" },
          },
        },
      ]),
    ]);

    const successMap = new Map(successRows.map((row) => [row._id, row.count]));
    const failMap = new Map(failRows.map((row) => [row._id, row.count]));

    let total = 0;
    for (let i = 1; i <= days; i += 1) {
      const dayKey = toUtcYmd(addDays(now, -i));
      total += (successMap.get(dayKey) || 0) + (failMap.get(dayKey) || 0);
    }
    return total / days;
  }
}
