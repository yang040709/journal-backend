/**
 * Schema 迁移 Runner：按 registry 顺序执行未成功的 name+version，
 * Mongo 账本抢锁，避免多实例重复盲扫。
 *
 * 首次部署含 content-preview / note-cover-keys 时可能拖长启动数分钟。
 * 应急跳过：SCHEMA_MIGRATIONS_DISABLED=1
 */

import SchemaMigrationRun from "../model/SchemaMigrationRun";
import ShareSecurityTask from "../model/ShareSecurityTask";
import logger from "../utils/logger";
import { schemaMigrations } from "./registry";
import type {
  SchemaMigration,
  SchemaMigrationContext,
  SchemaMigrationMeta,
} from "./types";

export const SCHEMA_MIGRATION_MAX_ATTEMPTS = 3;
export const SCHEMA_MIGRATION_STUCK_MS = 30 * 60 * 1000;

export interface RunPendingMigrationsOptions {
  /** 只跑指定 name（CLI）；仍走账本，除非 dryRun */
  forceName?: string;
  dryRun?: boolean;
  userId?: string;
  /** 测试注入自定义清单 */
  migrations?: SchemaMigration[];
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

function migrationsDisabled(): boolean {
  const raw = String(process.env.SCHEMA_MIGRATIONS_DISABLED || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * 抢锁：新建 running，或回收 failed（未超次）/ 卡住的 running。
 * 抢不到返回 null（他实例在跑 / 已 success / 失败次数用尽）。
 */
export async function claimSchemaMigration(
  name: string,
  version: number,
  now = new Date(),
  stuckMs = SCHEMA_MIGRATION_STUCK_MS,
  maxAttempts = SCHEMA_MIGRATION_MAX_ATTEMPTS,
) {
  const stuckBefore = new Date(now.getTime() - stuckMs);

  const reclaimed = await SchemaMigrationRun.findOneAndUpdate(
    {
      name,
      version,
      $or: [
        { status: "failed", attemptCount: { $lt: maxAttempts } },
        { status: "running", lockedAt: { $lt: stuckBefore } },
      ],
    },
    {
      $set: {
        status: "running",
        lockedAt: now,
        startedAt: now,
      },
      $unset: {
        finishedAt: 1,
        errorMessage: 1,
        meta: 1,
      },
      $inc: { attemptCount: 1 },
    },
    { new: true },
  );
  if (reclaimed) return reclaimed;

  try {
    return await SchemaMigrationRun.create({
      name,
      version,
      status: "running",
      attemptCount: 1,
      startedAt: now,
      lockedAt: now,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) return null;
    throw err;
  }
}

async function markSuccess(
  name: string,
  version: number,
  meta?: SchemaMigrationMeta | null,
) {
  await SchemaMigrationRun.findOneAndUpdate(
    { name, version },
    {
      $set: {
        status: "success",
        finishedAt: new Date(),
        ...(meta ? { meta } : {}),
      },
      $unset: {
        lockedAt: 1,
        errorMessage: 1,
        ...(meta ? {} : { meta: 1 }),
      },
    },
  );
}

async function markFailed(name: string, version: number, error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown");
  await SchemaMigrationRun.findOneAndUpdate(
    { name, version },
    {
      $set: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: message.slice(0, 2000),
      },
      $unset: { lockedAt: 1 },
    },
  );
}

async function runOne(
  migration: SchemaMigration,
  ctx: SchemaMigrationContext,
): Promise<"ran" | "skipped" | "failed"> {
  const { name, version } = migration;

  const existing = await SchemaMigrationRun.findOne({ name, version }).lean();
  if (existing?.status === "success") {
    logger.info(`Schema migration skip (success): ${name}@${version}`);
    return "skipped";
  }

  if (
    existing?.status === "failed" &&
    existing.attemptCount >= SCHEMA_MIGRATION_MAX_ATTEMPTS
  ) {
    logger.warn(
      `Schema migration blocked (max attempts): ${name}@${version}`,
      { attemptCount: existing.attemptCount, errorMessage: existing.errorMessage },
    );
    return "skipped";
  }

  if (
    existing?.status === "running" &&
    existing.lockedAt &&
    Date.now() - new Date(existing.lockedAt).getTime() <
      SCHEMA_MIGRATION_STUCK_MS
  ) {
    logger.info(`Schema migration skip (running): ${name}@${version}`);
    return "skipped";
  }

  const claimed = await claimSchemaMigration(name, version);
  if (!claimed) {
    logger.info(`Schema migration skip (claim lost): ${name}@${version}`);
    return "skipped";
  }

  logger.info(`Schema migration start: ${name}@${version}`, {
    attemptCount: claimed.attemptCount,
  });

  try {
    const meta = (await migration.run(ctx)) || undefined;
    await markSuccess(name, version, meta);
    logger.info(`Schema migration success: ${name}@${version}`, { meta });
    return "ran";
  } catch (err) {
    await markFailed(name, version, err);
    logger.error(`Schema migration failed: ${name}@${version}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}

/**
 * 执行账本中尚未 success 的迁移。
 * dryRun 时不写账本，直接调用模块（供 CLI）。
 */
export async function runPendingMigrations(
  options: RunPendingMigrationsOptions = {},
): Promise<void> {
  if (migrationsDisabled()) {
    logger.warn("Schema migrations disabled via SCHEMA_MIGRATIONS_DISABLED");
    return;
  }

  const list = options.migrations ?? schemaMigrations;
  const forceName = options.forceName?.trim();
  const ctx: SchemaMigrationContext = {
    dryRun: options.dryRun,
    userId: options.userId,
  };

  logger.info("Schema migrations: checking pending…");

  try {
    await SchemaMigrationRun.syncIndexes();
  } catch (e) {
    logger.error("SchemaMigrationRun index sync failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  for (const migration of list) {
    if (forceName && migration.name !== forceName) continue;

    if (options.dryRun) {
      logger.info(
        `Schema migration dry-run: ${migration.name}@${migration.version}`,
      );
      const meta = await migration.run(ctx);
      logger.info(
        `Schema migration dry-run done: ${migration.name}@${migration.version}`,
        { meta },
      );
      continue;
    }

    await runOne(migration, ctx);
  }

  logger.info("Schema migrations: pass complete");
}

/** 索引同步：每次启动执行，不记版本账本 */
export async function ensureShareSecurityTaskIndexes() {
  try {
    await ShareSecurityTask.syncIndexes();
    logger.info("ShareSecurityTask indexes synced");
  } catch (e) {
    logger.error("ShareSecurityTask index sync failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
