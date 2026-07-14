/**
 * 数据库迁移工具（薄封装，逻辑在 src/migrations/）
 */

export {
  runPendingMigrations,
  ensureShareSecurityTaskIndexes,
  claimSchemaMigration,
  SCHEMA_MIGRATION_MAX_ATTEMPTS,
  SCHEMA_MIGRATION_STUCK_MS,
} from "../migrations/runner";

/** @deprecated 使用 runPendingMigrations */
export { runPendingMigrations as runMigrations } from "../migrations/runner";
