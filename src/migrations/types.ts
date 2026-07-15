export interface SchemaMigrationMeta {
  scanned?: number;
  modified?: number;
  message?: string;
}

export interface SchemaMigrationContext {
  dryRun?: boolean;
  userId?: string;
}

export interface SchemaMigration {
  name: string;
  version: number;
  run: (ctx: SchemaMigrationContext) => Promise<SchemaMigrationMeta | void>;
}
