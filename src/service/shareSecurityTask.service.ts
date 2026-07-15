import crypto from "crypto";
import { nanoid } from "nanoid";
import Note from "../model/Note";
import ShareSecurityTask, {
  IShareSecurityTask,
  ShareRiskSnapshotImage,
  ShareSecurityTaskStatus,
} from "../model/ShareSecurityTask";
import { WeChatContentSecurityService } from "./wechatContentSecurity.service";

function getWorkerIntervalMs(): number {
  const v = Number(process.env.SHARE_SECURITY_WORKER_INTERVAL_MS || 3000);
  return Number.isFinite(v) && v > 0 ? v : 3000;
}

function getMaxRetry(): number {
  const v = Number(process.env.SHARE_SECURITY_MAX_RETRY || 3);
  // Keep backward-compatible semantics with historical `Number(env || 3)` behavior.
  return v || 3;
}

/** running 卡住超过该时间则回收为 queued */
export const SHARE_SECURITY_STUCK_MS = 15 * 60 * 1000;

export interface ShareRiskSummary {
  riskStatus: "none" | "pass" | "risky_wechat" | "reject_local" | "reject_wechat" | "error";
  riskReason?: string;
  riskUpdatedAt?: Date | null;
}

let workerStarted = false;
let running = false;

function digestText(input: string): string {
  return crypto.createHash("sha256").update(input || "").digest("hex");
}

function nextRetryDate(retryCount: number): Date {
  const delay = Math.min(60_000, Math.pow(2, retryCount) * 1000);
  return new Date(Date.now() + delay);
}

async function closeShareIfVersionMatch(
  noteId: string,
  shareVersion: number,
): Promise<void> {
  await Note.updateOne(
    { _id: noteId, shareVersion, isShare: true },
    { $set: { isShare: false } },
    { timestamps: false },
  );
}

export class ShareSecurityTaskService {
  private static normalizeSnapshotImages(images: Array<{
    key?: string;
    url?: string;
    thumbUrl?: string;
  }>): ShareRiskSnapshotImage[] {
    return (images || [])
      .map((item) => ({
        key: item?.key ? String(item.key) : undefined,
        url: String(item?.url || "").trim(),
        thumbUrl: item?.thumbUrl ? String(item.thumbUrl) : undefined,
      }))
      .filter((item) => Boolean(item.url));
  }

  static async recordLocalReject(params: {
    noteId: string;
    userId: string;
    shareVersion: number;
    reason: string;
    title: string;
    content: string;
    tags: string[];
    images: Array<{ key?: string; url?: string; thumbUrl?: string }>;
  }): Promise<void> {
    await ShareSecurityTask.create({
      taskId: nanoid(14),
      noteId: params.noteId,
      userId: params.userId,
      shareVersion: params.shareVersion,
      scene: "share_enable",
      source: "local",
      imageCount: 0,
      status: "reject_local",
      resultCode: "LOCAL_SENSITIVE_WORD",
      resultDetail: params.reason,
      snapshot: {
        title: String(params.title || ""),
        content: String(params.content || ""),
        tags: Array.isArray(params.tags) ? params.tags.map((tag) => String(tag)) : [],
        images: this.normalizeSnapshotImages(params.images || []),
        riskMeta: {
          source: "local",
          code: "LOCAL_SENSITIVE_WORD",
          detail: params.reason,
        },
      },
    });
  }

  static async enqueueWeChatChecks(params: {
    noteId: string;
    userId: string;
    shareVersion: number;
    title: string;
    content: string;
    tags: string[];
    images: Array<{ key?: string; url?: string; thumbUrl?: string }>;
  }): Promise<void> {
    const textPayload = `${params.title || ""}\n${params.content || ""}`.trim();
    const snapshotTags = Array.isArray(params.tags) ? params.tags.map((tag) => String(tag)) : [];
    const snapshotImages = this.normalizeSnapshotImages(params.images || []);
    await ShareSecurityTask.create({
      taskId: nanoid(14),
      noteId: params.noteId,
      userId: params.userId,
      shareVersion: params.shareVersion,
      scene: "share_enable",
      source: "wechat_text",
      textPayloadDigest: digestText(textPayload),
      imageCount: snapshotImages.length,
      status: "queued",
      retryCount: 0,
      nextRetryAt: new Date(),
      snapshot: {
        title: String(params.title || ""),
        content: String(params.content || ""),
        tags: snapshotTags,
        images: snapshotImages,
        riskMeta: {
          source: "wechat_text",
        },
      },
    });

    // 仅保留微信文本风控；图片风控按产品策略关闭，不再入队图片检测任务。
  }

  static async getLatestRiskSummary(noteId: string): Promise<ShareRiskSummary> {
    const latest = await ShareSecurityTask.findOne({ noteId })
      .sort({ createdAt: -1 })
      .lean();
    if (!latest) return { riskStatus: "none", riskUpdatedAt: null };
    return {
      riskStatus: this.mapTaskStatusToRiskStatus(latest.status),
      riskReason: latest.resultCode || undefined,
      riskUpdatedAt: latest.updatedAt || latest.createdAt || null,
    };
  }

  static mapTaskStatusToRiskStatus(
    status: ShareSecurityTaskStatus,
  ): ShareRiskSummary["riskStatus"] {
    if (status === "pass") return "pass";
    if (status === "risky_wechat") return "risky_wechat";
    if (status === "reject_local") return "reject_local";
    if (status === "reject_wechat") return "reject_wechat";
    if (status === "error") return "error";
    return "none";
  }

  /**
   * Soft-delete: drop incomplete tasks so worker stops WeChat checks.
   * Terminal results are kept until hard purge / deleteByNoteId.
   */
  static async cancelByNoteId(noteId: string, userId: string): Promise<number> {
    if (!noteId || !userId) return 0;
    const result = await ShareSecurityTask.deleteMany({
      noteId,
      userId,
      status: { $in: ["queued", "running", "error"] },
    });
    return result.deletedCount || 0;
  }

  static async cancelByNoteIds(noteIds: string[], userId: string): Promise<number> {
    const ids = (noteIds || []).map((id) => String(id || "").trim()).filter(Boolean);
    if (!ids.length || !userId) return 0;
    const result = await ShareSecurityTask.deleteMany({
      noteId: { $in: ids },
      userId,
      status: { $in: ["queued", "running", "error"] },
    });
    return result.deletedCount || 0;
  }

  /** Hard delete / purge: remove all security tasks for the note. */
  static async deleteByNoteId(noteId: string, userId: string): Promise<number> {
    if (!noteId || !userId) return 0;
    const result = await ShareSecurityTask.deleteMany({ noteId, userId });
    return result.deletedCount || 0;
  }

  static async deleteByNoteIds(noteIds: string[], userId: string): Promise<number> {
    const ids = (noteIds || []).map((id) => String(id || "").trim()).filter(Boolean);
    if (!ids.length || !userId) return 0;
    const result = await ShareSecurityTask.deleteMany({
      noteId: { $in: ids },
      userId,
    });
    return result.deletedCount || 0;
  }

  static startWorker(): void {
    if (workerStarted) return;
    workerStarted = true;
    setInterval(() => {
      void this.runOnce();
    }, getWorkerIntervalMs());
  }

  private static async reclaimStuckRunning(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - SHARE_SECURITY_STUCK_MS);
    const result = await ShareSecurityTask.updateMany(
      {
        status: "running",
        $or: [
          { lockedAt: { $lte: cutoff } },
          { lockedAt: null },
          { lockedAt: { $exists: false } },
        ],
      },
      {
        $set: {
          status: "queued",
          nextRetryAt: now,
          lockedAt: null,
        },
      },
    );
    return result.modifiedCount || 0;
  }

  private static async runOnce(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      await this.reclaimStuckRunning(now);

      const task = await ShareSecurityTask.findOneAndUpdate(
        {
          status: { $in: ["queued", "error"] },
          $or: [{ nextRetryAt: { $lte: now } }, { nextRetryAt: null }],
        },
        { $set: { status: "running", lockedAt: now } },
        { sort: { createdAt: 1 }, new: true },
      );
      if (!task) return;
      await this.handleTask(task);
    } finally {
      running = false;
    }
  }

  /** Exposed for unit tests */
  static async runOnceForTest(): Promise<void> {
    await this.runOnce();
  }

  /** Exposed for unit tests; production path uses runOnce → handleTask. */
  static async handleTask(task: IShareSecurityTask): Promise<void> {
    try {
      const note = await Note.findById(task.noteId).select("isDeleted").lean();
      if (!note || note.isDeleted) {
        await ShareSecurityTask.deleteOne({ _id: task._id });
        return;
      }

      if (task.source === "wechat_text") {
        const textPayload = `${task.snapshot?.title || ""}\n${task.snapshot?.content || ""}`.trim();
        const result = await WeChatContentSecurityService.checkText(
          textPayload,
          task.userId,
        );
        console.log(
          `[share-security][text] taskId=${task.taskId} decision=${result.decision} suggest=${result.suggest || "unknown"} label=${result.label || 0} code=${result.code || ""} traceId=${result.traceId || ""}`,
        );
        if (result.decision === "pass" && result.suggest === "risky") {
          await ShareSecurityTask.updateOne(
            { _id: task._id },
            {
              $set: {
                status: "risky_wechat",
                lockedAt: null,
                resultCode: result.code || "WECHAT_TEXT_RISKY",
                resultDetail: result.detail || "suggest=risky",
                wechatTraceId: result.traceId,
                "snapshot.riskMeta.code": result.code || "WECHAT_TEXT_RISKY",
                "snapshot.riskMeta.detail": result.detail || "suggest=risky",
                "snapshot.riskMeta.traceId": result.traceId || "",
              },
            },
          );
          return;
        }
        if (result.decision === "reject") {
          await closeShareIfVersionMatch(task.noteId, task.shareVersion);
          await ShareSecurityTask.updateOne(
            { _id: task._id },
            {
              $set: {
                status: "reject_wechat",
                lockedAt: null,
                resultCode: result.code || "WECHAT_TEXT_REJECT",
                resultDetail: result.detail || "",
                wechatTraceId: result.traceId,
                "snapshot.riskMeta.code": result.code || "WECHAT_TEXT_REJECT",
                "snapshot.riskMeta.detail": result.detail || "",
                "snapshot.riskMeta.traceId": result.traceId || "",
              },
            },
          );
          return;
        }
        if (result.decision === "retry") {
          await this.scheduleTaskRetry(
            task,
            result.code || "WECHAT_TEXT_RETRY",
            result.detail || "wechat check retryable failure",
          );
          return;
        }
        await ShareSecurityTask.updateOne(
          { _id: task._id },
          {
            $set: {
              status: "pass",
              lockedAt: null,
              resultCode: "WECHAT_TEXT_PASS",
              wechatTraceId: result.traceId,
              "snapshot.riskMeta.code": "WECHAT_TEXT_PASS",
              "snapshot.riskMeta.traceId": result.traceId || "",
            },
          },
        );
        return;
      }

      if (task.source === "wechat_image") {
        await ShareSecurityTask.updateOne(
          { _id: task._id },
          {
            $set: {
              status: "pass",
              lockedAt: null,
              resultCode: "WECHAT_IMAGE_CHECK_DISABLED",
              resultDetail: "image check skipped",
              "snapshot.riskMeta.code": "WECHAT_IMAGE_CHECK_DISABLED",
              "snapshot.riskMeta.detail": "image check skipped",
            },
          },
        );
        return;
      }

      await ShareSecurityTask.updateOne(
        { _id: task._id },
        { $set: { status: "pass", lockedAt: null, resultCode: "LOCAL_PASS" } },
      );
    } catch (e) {
      await this.scheduleTaskRetry(
        task,
        "TASK_EXCEPTION",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  /**
   * Infrastructure / transport failures: requeue. Never close share for these.
   * Exhausted retries mark task `error` but leave `isShare` unchanged.
   */
  private static async scheduleTaskRetry(
    task: IShareSecurityTask,
    resultCode: string,
    resultDetail: string,
  ): Promise<void> {
    const retryCount = (task.retryCount || 0) + 1;
    const exhausted = retryCount >= getMaxRetry();
    await ShareSecurityTask.updateOne(
      { _id: task._id },
      {
        $set: {
          status: exhausted ? "error" : "queued",
          retryCount,
          nextRetryAt: exhausted ? null : nextRetryDate(retryCount),
          lockedAt: null,
          resultCode: exhausted ? "TASK_RETRY_EXHAUSTED" : resultCode,
          resultDetail,
          "snapshot.riskMeta.code": exhausted ? "TASK_RETRY_EXHAUSTED" : resultCode,
          "snapshot.riskMeta.detail": resultDetail,
        },
      },
    );
  }
}
