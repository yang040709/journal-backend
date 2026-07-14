import type { SchemaMigration } from "./types";
import { userPointsDefaultMigration } from "./user-points-default";
import { userProfileDefaultsMigration } from "./user-profile-defaults";
import { uploadBizBreakdownAvatarMigration } from "./upload-biz-breakdown-avatar";
import { shareVersionDefaultMigration } from "./share-version-default";
import { softDeleteBackfillMigration } from "./soft-delete-backfill";
import { contentPreviewMigration } from "./content-preview";
import { noteCoverKeysMigration } from "./note-cover-keys";

/** 有序 schema 迁移清单；同 name+version 成功后不再执行 */
export const schemaMigrations: SchemaMigration[] = [
  userPointsDefaultMigration,
  userProfileDefaultsMigration,
  uploadBizBreakdownAvatarMigration,
  shareVersionDefaultMigration,
  softDeleteBackfillMigration,
  contentPreviewMigration,
  noteCoverKeysMigration,
];
