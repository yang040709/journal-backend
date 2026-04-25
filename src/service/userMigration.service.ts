import mongoose, { ClientSession } from "mongoose";
import Note from "../model/Note";
import NoteBook from "../model/NoteBook";
import Reminder from "../model/Reminder";
import Template from "../model/Template";
import User from "../model/User";
import UserAdRewardLog from "../model/UserAdRewardLog";
import UserAiUsageDaily from "../model/UserAiUsageDaily";
import UserImageAsset from "../model/UserImageAsset";
import UserMigrationTask, {
  IUserMigrationModuleResult,
  IUserMigrationTask,
  UserMigrationTaskStatus,
} from "../model/UserMigrationTask";
import UserUploadQuotaDaily from "../model/UserUploadQuotaDaily";

type ModuleRunResult = {
  moduleResult: IUserMigrationModuleResult;
  rollback: () => Promise<void>;
};

type ExecutePayload = {
  sourceOpenid: string;
  targetOpenid: string;
  operator: string;
  remark: string;
  idempotencyKey: string;
};

type PrecheckPayload = {
  sourceOpenid: string;
  targetOpenid: string;
  remark: string;
  operator: string;
};

type TaskDetail = {
  taskId: string;
  sourceOpenid: string;
  targetOpenid: string;
  operator: string;
  remark: string;
  idempotencyKey: string;
  status: UserMigrationTaskStatus;
  moduleResults: IUserMigrationModuleResult[];
  precheckSummary?: Record<string, number>;
  errorMessage?: string;
  rollbackMessage?: string;
  attemptCount: number;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

class MigrationBusinessError extends Error {
  code: "CONFLICT" | "NOT_FOUND" | "PARAM";

  constructor(message: string, code: "CONFLICT" | "NOT_FOUND" | "PARAM") {
    super(message);
    this.code = code;
  }
}

function makeTaskId() {
  return `mig_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneWithoutId<T extends Record<string, unknown>>(doc: T) {
  const next = { ...doc };
  delete next._id;
  delete next.id;
  return next;
}

function asObjectId(id: string) {
  return new mongoose.Types.ObjectId(id);
}

async function runWithOptionalTransaction<T>(
  fn: (session?: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let out!: T;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out;
  } catch {
    return fn(undefined);
  } finally {
    await session.endSession();
  }
}

export class UserMigrationService {
  static async precheck(payload: PrecheckPayload) {
    const sourceOpenid = String(payload.sourceOpenid || "").trim();
    const targetOpenid = String(payload.targetOpenid || "").trim();
    if (!sourceOpenid || !targetOpenid) {
      throw new MigrationBusinessError("sourceOpenid 与 targetOpenid 不能为空", "PARAM");
    }
    if (sourceOpenid === targetOpenid) {
      throw new MigrationBusinessError("旧账号与新账号不能相同", "PARAM");
    }
    if (!String(payload.remark || "").trim()) {
      throw new MigrationBusinessError("remark 不能为空", "PARAM");
    }
    if (!String(payload.operator || "").trim()) {
      throw new MigrationBusinessError("operator 不能为空", "PARAM");
    }

    const [sourceUser, targetUser] = await Promise.all([
      User.findOne({ userId: sourceOpenid }).select("userId").lean(),
      User.findOne({ userId: targetOpenid }).select("userId").lean(),
    ]);

    if (!sourceUser) {
      throw new MigrationBusinessError("旧账号不存在", "NOT_FOUND");
    }
    if (!targetUser) {
      throw new MigrationBusinessError("新账号不存在", "NOT_FOUND");
    }

    const [notes, notebooks, reminders, templates, assets] = await Promise.all([
      Note.countDocuments({ userId: sourceOpenid }),
      NoteBook.countDocuments({ userId: sourceOpenid }),
      Reminder.countDocuments({ userId: sourceOpenid }),
      Template.countDocuments({ userId: sourceOpenid, isSystem: false }),
      UserImageAsset.countDocuments({ userId: sourceOpenid }),
    ]);

    return {
      canMigrate: true,
      risks: [],
      summary: {
        notes,
        notebooks,
        reminders,
        templates,
        assets,
      },
    };
  }

  static async execute(payload: ExecutePayload) {
    const sourceOpenid = String(payload.sourceOpenid || "").trim();
    const targetOpenid = String(payload.targetOpenid || "").trim();
    const operator = String(payload.operator || "").trim();
    const remark = String(payload.remark || "").trim();
    const idempotencyKey = String(payload.idempotencyKey || "").trim();
    if (!sourceOpenid || !targetOpenid || !operator || !remark || !idempotencyKey) {
      throw new MigrationBusinessError("迁徙参数不完整", "PARAM");
    }
    if (sourceOpenid === targetOpenid) {
      throw new MigrationBusinessError("旧账号与新账号不能相同", "PARAM");
    }

    const precheck = await UserMigrationService.precheck({
      sourceOpenid,
      targetOpenid,
      operator,
      remark,
    });

    let task = await UserMigrationTask.findOne({ idempotencyKey });
    if (task?.status === "running") {
      throw new MigrationBusinessError("当前幂等任务执行中，请稍后查询结果", "CONFLICT");
    }
    if (task?.status === "success") {
      return {
        task: UserMigrationService.toTaskDetail(task),
        idempotentHit: true,
      };
    }

    if (!task) {
      task = await UserMigrationTask.create({
        taskId: makeTaskId(),
        sourceOpenid,
        targetOpenid,
        operator,
        remark,
        idempotencyKey,
        status: "pending",
        precheckSummary: precheck.summary,
      });
    }

    task.sourceOpenid = sourceOpenid;
    task.targetOpenid = targetOpenid;
    task.operator = operator;
    task.remark = remark;
    task.status = "running";
    task.errorMessage = "";
    task.rollbackMessage = "";
    task.moduleResults = [];
    task.precheckSummary = precheck.summary;
    task.attemptCount = (task.attemptCount || 0) + 1;
    task.startedAt = new Date();
    task.finishedAt = undefined;
    await task.save();

    const rollbackStack: Array<() => Promise<void>> = [];
    const moduleResults: IUserMigrationModuleResult[] = [];

    try {
      const noteMap = new Map<string, string>();
      const modules: Array<() => Promise<ModuleRunResult>> = [
        () => UserMigrationService.runUserProfileModule(sourceOpenid, targetOpenid),
        () => UserMigrationService.runNotebookModule(sourceOpenid, targetOpenid, noteMap),
        () => UserMigrationService.runNoteModule(sourceOpenid, targetOpenid, noteMap),
        () => UserMigrationService.runReminderModule(sourceOpenid, targetOpenid, noteMap),
        () => UserMigrationService.runTemplateModule(sourceOpenid, targetOpenid),
        () => UserMigrationService.runAssetModule(sourceOpenid, targetOpenid, noteMap),
        () => UserMigrationService.runQuotaModule(sourceOpenid, targetOpenid),
      ];

      for (const run of modules) {
        const result = await run();
        moduleResults.push(result.moduleResult);
        rollbackStack.push(result.rollback);
      }

      task.status = "success";
      task.moduleResults = moduleResults;
      task.finishedAt = new Date();
      await task.save();
      return {
        task: UserMigrationService.toTaskDetail(task),
        idempotentHit: false,
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "迁徙执行失败";
      let rollbackFailedMessage = "";
      while (rollbackStack.length > 0) {
        const rollback = rollbackStack.pop()!;
        try {
          await rollback();
        } catch (rollbackError) {
          rollbackFailedMessage = rollbackError instanceof Error ? rollbackError.message : "回滚失败";
          break;
        }
      }

      task.moduleResults = moduleResults;
      task.errorMessage = reason;
      task.finishedAt = new Date();
      if (rollbackFailedMessage) {
        task.status = "rollback_failed";
        task.rollbackMessage = rollbackFailedMessage;
      } else {
        task.status = "failed";
      }
      await task.save();
      throw new MigrationBusinessError(reason, "CONFLICT");
    }
  }

  static async getTaskDetail(taskId: string): Promise<TaskDetail | null> {
    const id = String(taskId || "").trim();
    if (!id) return null;
    const task = await UserMigrationTask.findOne({ taskId: id }).lean();
    if (!task) return null;
    return {
      taskId: task.taskId,
      sourceOpenid: task.sourceOpenid,
      targetOpenid: task.targetOpenid,
      operator: task.operator,
      remark: task.remark,
      idempotencyKey: task.idempotencyKey,
      status: task.status,
      moduleResults: task.moduleResults || [],
      precheckSummary: task.precheckSummary as Record<string, number> | undefined,
      errorMessage: task.errorMessage,
      rollbackMessage: task.rollbackMessage,
      attemptCount: task.attemptCount || 0,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private static toTaskDetail(task: IUserMigrationTask): TaskDetail {
    return {
      taskId: task.taskId,
      sourceOpenid: task.sourceOpenid,
      targetOpenid: task.targetOpenid,
      operator: task.operator,
      remark: task.remark,
      idempotencyKey: task.idempotencyKey,
      status: task.status,
      moduleResults: task.moduleResults || [],
      precheckSummary: task.precheckSummary as Record<string, number> | undefined,
      errorMessage: task.errorMessage,
      rollbackMessage: task.rollbackMessage,
      attemptCount: task.attemptCount || 0,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private static async runUserProfileModule(
    sourceOpenid: string,
    targetOpenid: string,
  ): Promise<ModuleRunResult> {
    const [source, target] = await Promise.all([
      User.findOne({ userId: sourceOpenid }).lean(),
      User.findOne({ userId: targetOpenid }).lean(),
    ]);
    if (!source || !target) {
      throw new Error("账号不存在，无法迁徙用户资料");
    }
    const targetId = String(target._id);
    const oldSnapshot = {
      nickname: target.nickname || "",
      avatarUrl: target.avatarUrl || "",
      bio: target.bio || "",
      membershipText: target.membershipText || "",
      points: target.points ?? 0,
      exportExtraCredits: target.exportExtraCredits ?? 0,
      adRewardDailyLimit: target.adRewardDailyLimit ?? null,
      aiBonusQuota: target.aiBonusQuota ?? 0,
      uploadExtraQuotaTotal: target.uploadExtraQuotaTotal ?? 0,
      quickCovers: Array.isArray(target.quickCovers) ? target.quickCovers : [],
      customCovers: Array.isArray(target.customCovers) ? target.customCovers : [],
      customNoteTags: Array.isArray(target.customNoteTags) ? target.customNoteTags : [],
      quickCoversUpdatedAt: target.quickCoversUpdatedAt || new Date(),
    };

    await User.updateOne(
      { _id: targetId },
      {
        $set: {
          nickname: source.nickname || "",
          avatarUrl: source.avatarUrl || "",
          bio: source.bio || "",
          membershipText: source.membershipText || "",
          points: source.points ?? 0,
          exportExtraCredits: source.exportExtraCredits ?? 0,
          adRewardDailyLimit: source.adRewardDailyLimit ?? null,
          aiBonusQuota: source.aiBonusQuota ?? 0,
          uploadExtraQuotaTotal: source.uploadExtraQuotaTotal ?? 0,
          quickCovers: Array.isArray(source.quickCovers) ? source.quickCovers : [],
          customCovers: Array.isArray(source.customCovers) ? source.customCovers : [],
          customNoteTags: Array.isArray(source.customNoteTags) ? source.customNoteTags : [],
          quickCoversUpdatedAt: source.quickCoversUpdatedAt || new Date(),
        },
      },
    );

    return {
      moduleResult: {
        name: "user_profile",
        scanned: 1,
        covered: 1,
        skipped: 0,
        status: "success",
      },
      rollback: async () => {
        await User.updateOne(
          { _id: targetId },
          {
            $set: oldSnapshot,
          },
        );
      },
    };
  }

  private static async runNotebookModule(
    sourceOpenid: string,
    targetOpenid: string,
    noteMap: Map<string, string>,
  ): Promise<ModuleRunResult> {
    const [sourceDocs, targetDocs] = await Promise.all([
      NoteBook.find({ userId: sourceOpenid }).lean(),
      NoteBook.find({ userId: targetOpenid }).lean(),
    ]);

    const sourcePlain = sourceDocs.map((x) => cloneWithoutId(x as unknown as Record<string, unknown>));
    const targetPlain = targetDocs.map((x) => cloneWithoutId(x as unknown as Record<string, unknown>));
    const oldTargetIds = targetDocs.map((x) => String(x._id));
    const sourceCount = sourceDocs.length;

    const insertedIdMap = new Map<string, string>();
    if (sourceCount > 0) {
      const inserted = await NoteBook.insertMany(
        sourceDocs.map((doc) => {
          const next = cloneWithoutId(doc as unknown as Record<string, unknown>);
          return {
            ...next,
            _id: new mongoose.Types.ObjectId(),
            userId: targetOpenid,
          };
        }),
      );
      for (let i = 0; i < sourceDocs.length; i += 1) {
        insertedIdMap.set(String(sourceDocs[i]._id), String(inserted[i]._id));
      }
      await NoteBook.deleteMany({ _id: { $in: oldTargetIds.map(asObjectId) } });
    } else {
      await NoteBook.deleteMany({ _id: { $in: oldTargetIds.map(asObjectId) } });
    }

    for (const [oldId, newId] of insertedIdMap) {
      noteMap.set(oldId, newId);
    }

    return {
      moduleResult: {
        name: "notebooks",
        scanned: sourceCount,
        covered: sourceCount,
        skipped: 0,
        status: "success",
      },
      rollback: async () => {
        const insertedIds = [...insertedIdMap.values()];
        if (insertedIds.length > 0) {
          await NoteBook.deleteMany({ _id: { $in: insertedIds.map(asObjectId) } });
        }
        if (targetPlain.length > 0) {
          await NoteBook.insertMany(
            targetPlain.map((x) => ({
              ...x,
              userId: targetOpenid,
            })),
          );
        }
      },
    };
  }

  private static async runNoteModule(
    sourceOpenid: string,
    targetOpenid: string,
    noteBookIdMap: Map<string, string>,
  ): Promise<ModuleRunResult> {
    const [sourceDocs, targetDocs] = await Promise.all([
      Note.find({ userId: sourceOpenid }).lean(),
      Note.find({ userId: targetOpenid }).lean(),
    ]);
    const sourceCount = sourceDocs.length;
    const oldTargetIds = targetDocs.map((x) => String(x._id));
    const targetPlain = targetDocs.map((x) => cloneWithoutId(x as unknown as Record<string, unknown>));

    const noteIdMap = new Map<string, string>();
    if (sourceCount > 0) {
      const inserted = await runWithOptionalTransaction(async (session) => {
        const options = session ? { session } : undefined;
        if (oldTargetIds.length > 0) {
          await Note.deleteMany({ _id: { $in: oldTargetIds.map(asObjectId) } }, options as never);
        }
        const rows = await Note.insertMany(
          sourceDocs.map((doc) => {
            const next = cloneWithoutId(doc as unknown as Record<string, unknown>);
            const oldBookId = String(doc.noteBookId || "");
            const mappedNoteBookId = noteBookIdMap.get(oldBookId) || oldBookId;
            return {
              ...next,
              _id: new mongoose.Types.ObjectId(),
              userId: targetOpenid,
              noteBookId: mappedNoteBookId,
              // shareId 在全表唯一；复制迁徙时需重置为未分享态，避免与旧账号冲突
              isShare: false,
              shareId: undefined,
              shareVersion: 0,
              firstSharedAt: undefined,
            };
          }),
          options as never,
        );
        return rows;
      });
      for (let i = 0; i < sourceDocs.length; i += 1) {
        noteIdMap.set(String(sourceDocs[i]._id), String(inserted[i]._id));
      }
    } else if (oldTargetIds.length > 0) {
      await Note.deleteMany({ _id: { $in: oldTargetIds.map(asObjectId) } });
    }

    return {
      moduleResult: {
        name: "notes",
        scanned: sourceCount,
        covered: sourceCount,
        skipped: 0,
        status: "success",
      },
      rollback: async () => {
        const insertedIds = [...noteIdMap.values()];
        if (insertedIds.length > 0) {
          await Note.deleteMany({ _id: { $in: insertedIds.map(asObjectId) } });
        }
        if (targetPlain.length > 0) {
          await Note.insertMany(
            targetPlain.map((x) => ({
              ...x,
              userId: targetOpenid,
            })),
          );
        }
      },
    };
  }

  private static async runReminderModule(
    sourceOpenid: string,
    targetOpenid: string,
    noteIdMap: Map<string, string>,
  ): Promise<ModuleRunResult> {
    const [sourceDocs, targetDocs] = await Promise.all([
      Reminder.find({ userId: sourceOpenid }).lean(),
      Reminder.find({ userId: targetOpenid }).lean(),
    ]);
    const sourceCount = sourceDocs.length;
    const oldTargetIds = targetDocs.map((x) => String(x._id));
    const targetPlain = targetDocs.map((x) => cloneWithoutId(x as unknown as Record<string, unknown>));
    const insertedIds: string[] = [];

    if (sourceCount > 0) {
      const inserted = await Reminder.insertMany(
        sourceDocs.map((doc) => {
          const next = cloneWithoutId(doc as unknown as Record<string, unknown>);
          const oldNoteId = String(doc.noteId || "");
          const mappedNoteId = noteIdMap.get(oldNoteId) || oldNoteId;
          return {
            ...next,
            _id: new mongoose.Types.ObjectId(),
            userId: targetOpenid,
            noteId: mappedNoteId,
          };
        }),
      );
      inserted.forEach((row) => insertedIds.push(String(row._id)));
      if (oldTargetIds.length > 0) {
        await Reminder.deleteMany({ _id: { $in: oldTargetIds.map(asObjectId) } });
      }
    } else if (oldTargetIds.length > 0) {
      await Reminder.deleteMany({ _id: { $in: oldTargetIds.map(asObjectId) } });
    }

    return {
      moduleResult: {
        name: "reminders",
        scanned: sourceCount,
        covered: sourceCount,
        skipped: 0,
        status: "success",
      },
      rollback: async () => {
        if (insertedIds.length > 0) {
          await Reminder.deleteMany({ _id: { $in: insertedIds.map(asObjectId) } });
        }
        if (targetPlain.length > 0) {
          await Reminder.insertMany(
            targetPlain.map((x) => ({
              ...x,
              userId: targetOpenid,
            })),
          );
        }
      },
    };
  }

  private static async runTemplateModule(
    sourceOpenid: string,
    targetOpenid: string,
  ): Promise<ModuleRunResult> {
    const [sourceDocs, targetDocs] = await Promise.all([
      Template.find({ userId: sourceOpenid, isSystem: false }).lean(),
      Template.find({ userId: targetOpenid, isSystem: false }).lean(),
    ]);
    const oldTargetIds = targetDocs.map((x) => String(x._id));
    const targetPlain = targetDocs.map((x) => cloneWithoutId(x as unknown as Record<string, unknown>));
    const insertedIds: string[] = [];

    if (sourceDocs.length > 0) {
      const inserted = await Template.insertMany(
        sourceDocs.map((doc) => {
          const next = cloneWithoutId(doc as unknown as Record<string, unknown>);
          return {
            ...next,
            _id: new mongoose.Types.ObjectId(),
            userId: targetOpenid,
            isSystem: false,
            systemKey: undefined,
          };
        }),
      );
      inserted.forEach((row) => insertedIds.push(String(row._id)));
      if (oldTargetIds.length > 0) {
        await Template.deleteMany({ _id: { $in: oldTargetIds.map(asObjectId) } });
      }
    } else if (oldTargetIds.length > 0) {
      await Template.deleteMany({ _id: { $in: oldTargetIds.map(asObjectId) } });
    }

    return {
      moduleResult: {
        name: "templates",
        scanned: sourceDocs.length,
        covered: sourceDocs.length,
        skipped: 0,
        status: "success",
      },
      rollback: async () => {
        if (insertedIds.length > 0) {
          await Template.deleteMany({ _id: { $in: insertedIds.map(asObjectId) } });
        }
        if (targetPlain.length > 0) {
          await Template.insertMany(
            targetPlain.map((x) => ({
              ...x,
              userId: targetOpenid,
            })),
          );
        }
      },
    };
  }

  private static async runAssetModule(
    sourceOpenid: string,
    targetOpenid: string,
    noteIdMap: Map<string, string>,
  ): Promise<ModuleRunResult> {
    const [sourceDocs, targetDocs] = await Promise.all([
      UserImageAsset.find({ userId: sourceOpenid }).lean(),
      UserImageAsset.find({ userId: targetOpenid }).lean(),
    ]);
    const oldTargetIds = targetDocs.map((x) => String(x._id));
    const targetPlain = targetDocs.map((x) => cloneWithoutId(x as unknown as Record<string, unknown>));
    const insertedIds: string[] = [];
    if (sourceDocs.length > 0) {
      if (oldTargetIds.length > 0) {
        await UserImageAsset.deleteMany({ _id: { $in: oldTargetIds.map(asObjectId) } });
      }
      const inserted = await UserImageAsset.insertMany(
        sourceDocs.map((doc) => {
          const next = cloneWithoutId(doc as unknown as Record<string, unknown>);
          const oldRefId = String(doc.refId || "");
          const mappedRefId =
            doc.source === "note" && noteIdMap.has(oldRefId) ? noteIdMap.get(oldRefId)! : oldRefId;
          return {
            ...next,
            _id: new mongoose.Types.ObjectId(),
            userId: targetOpenid,
            refId: mappedRefId,
          };
        }),
      );
      inserted.forEach((row) => insertedIds.push(String(row._id)));
    } else if (oldTargetIds.length > 0) {
      await UserImageAsset.deleteMany({ _id: { $in: oldTargetIds.map(asObjectId) } });
    }

    return {
      moduleResult: {
        name: "image_assets",
        scanned: sourceDocs.length,
        covered: sourceDocs.length,
        skipped: 0,
        status: "success",
      },
      rollback: async () => {
        if (insertedIds.length > 0) {
          await UserImageAsset.deleteMany({ _id: { $in: insertedIds.map(asObjectId) } });
        }
        if (targetPlain.length > 0) {
          await UserImageAsset.insertMany(
            targetPlain.map((x) => ({
              ...x,
              userId: targetOpenid,
            })),
          );
        }
      },
    };
  }

  private static async runQuotaModule(
    sourceOpenid: string,
    targetOpenid: string,
  ): Promise<ModuleRunResult> {
    const [sourceUpload, sourceAi, sourceAdLog, oldUpload, oldAi, oldAdLog] = await Promise.all([
      UserUploadQuotaDaily.find({ userId: sourceOpenid }).lean(),
      UserAiUsageDaily.find({ userId: sourceOpenid }).lean(),
      UserAdRewardLog.find({ userId: sourceOpenid }).lean(),
      UserUploadQuotaDaily.find({ userId: targetOpenid }).lean(),
      UserAiUsageDaily.find({ userId: targetOpenid }).lean(),
      UserAdRewardLog.find({ userId: targetOpenid }).lean(),
    ]);

    const oldUploadPlain = oldUpload.map((x) => cloneWithoutId(x as unknown as Record<string, unknown>));
    const oldAiPlain = oldAi.map((x) => cloneWithoutId(x as unknown as Record<string, unknown>));
    const oldAdPlain = oldAdLog.map((x) => cloneWithoutId(x as unknown as Record<string, unknown>));

    await Promise.all([
      UserUploadQuotaDaily.deleteMany({ userId: targetOpenid }),
      UserAiUsageDaily.deleteMany({ userId: targetOpenid }),
      UserAdRewardLog.deleteMany({ userId: targetOpenid }),
    ]);

    const insertedUploadIds: string[] = [];
    const insertedAiIds: string[] = [];
    const insertedAdIds: string[] = [];

    if (sourceUpload.length > 0) {
      const rows = await UserUploadQuotaDaily.insertMany(
        sourceUpload.map((doc) => ({
          ...cloneWithoutId(doc as unknown as Record<string, unknown>),
          _id: new mongoose.Types.ObjectId(),
          userId: targetOpenid,
        })),
      );
      rows.forEach((x) => insertedUploadIds.push(String(x._id)));
    }
    if (sourceAi.length > 0) {
      const rows = await UserAiUsageDaily.insertMany(
        sourceAi.map((doc) => ({
          ...cloneWithoutId(doc as unknown as Record<string, unknown>),
          _id: new mongoose.Types.ObjectId(),
          userId: targetOpenid,
        })),
      );
      rows.forEach((x) => insertedAiIds.push(String(x._id)));
    }
    const sourceAdLogPointsOnly = sourceAdLog.filter(
      (doc) => String((doc as { rewardType?: string }).rewardType || "") === "points",
    );
    const skippedAdLogs = Math.max(0, sourceAdLog.length - sourceAdLogPointsOnly.length);

    if (sourceAdLogPointsOnly.length > 0) {
      const rows = await UserAdRewardLog.insertMany(
        sourceAdLogPointsOnly.map((doc) => ({
          ...cloneWithoutId(doc as unknown as Record<string, unknown>),
          _id: new mongoose.Types.ObjectId(),
          userId: targetOpenid,
          rewardToken: `${String(doc.rewardToken || "")}_migrated_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        })),
      );
      rows.forEach((x) => insertedAdIds.push(String(x._id)));
    }

    const scanned = sourceUpload.length + sourceAi.length + sourceAdLog.length;
    const covered = sourceUpload.length + sourceAi.length + sourceAdLogPointsOnly.length;
    return {
      moduleResult: {
        name: "quota_and_ad_logs",
        scanned,
        covered,
        skipped: skippedAdLogs,
        status: "success",
        message: skippedAdLogs > 0 ? `跳过 ${skippedAdLogs} 条历史 rewardType 广告日志` : undefined,
      },
      rollback: async () => {
        await Promise.all([
          insertedUploadIds.length
            ? UserUploadQuotaDaily.deleteMany({ _id: { $in: insertedUploadIds.map(asObjectId) } })
            : Promise.resolve(),
          insertedAiIds.length
            ? UserAiUsageDaily.deleteMany({ _id: { $in: insertedAiIds.map(asObjectId) } })
            : Promise.resolve(),
          insertedAdIds.length
            ? UserAdRewardLog.deleteMany({ _id: { $in: insertedAdIds.map(asObjectId) } })
            : Promise.resolve(),
        ]);

        if (oldUploadPlain.length > 0) {
          await UserUploadQuotaDaily.insertMany(
            oldUploadPlain.map((x) => ({
              ...x,
              userId: targetOpenid,
            })),
          );
        }
        if (oldAiPlain.length > 0) {
          await UserAiUsageDaily.insertMany(
            oldAiPlain.map((x) => ({
              ...x,
              userId: targetOpenid,
            })),
          );
        }
        if (oldAdPlain.length > 0) {
          await UserAdRewardLog.insertMany(
            oldAdPlain.map((x) => ({
              ...x,
              userId: targetOpenid,
            })),
          );
        }
      },
    };
  }
}

export { MigrationBusinessError };
