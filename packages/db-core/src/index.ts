// Re-export Kysely essentials so consumers depend on a single Kysely instance.
export {
  type Insertable,
  Kysely,
  type Selectable,
  sql,
  type Updateable,
} from "kysely";
export {
  BaseModel,
  type FindOptions,
  type OrderBy,
  type PaginateOptions,
  type Where,
} from "./base-model.js";
export { type CodegenOptions, runCodegen } from "./codegen.js";
export {
  DEFAULT_PER_PAGE,
  type GenericResponse,
  MAX_PER_PAGE,
  MIN_PER_PAGE,
  newId,
  nowIso,
  type PaginatedResult,
  type PaginationInput,
  type ResponseMetadata,
  resolvePagination,
  toDataResponse,
  toIsoString,
  toPaginatedResponse,
} from "./conventions.js";
export {
  createDatabaseIfNotExists,
  dropDatabase,
} from "./create-drop-db.js";
export {
  createDb,
  createDbFromPool,
  createPool,
  type DbCoreConfig,
} from "./db.js";
export {
  type DbEnv,
  getDbEnv,
  getDbEnvs,
  getPgConnection,
  getSslConfig,
  POSTGRES_MAINTENANCE_DB,
  toConnectionString,
} from "./env-connection.js";
export {
  type FastifyKyselyOptions,
  fastifyKysely,
  kyselyAutoConfigFromEnv,
} from "./fastify-kysely.js";
export {
  type KyselyMigrateCliOptions,
  runKyselyMigrateCli,
} from "./migrate-cli.js";
export {
  createMigrator,
  DEFAULT_MIGRATION_LOCK_TABLE,
  DEFAULT_MIGRATION_TABLE,
  type MigratorCliOptions,
  type MigratorOptions,
  makeMigration,
  migrateDown,
  migrateToLatest,
  runMigratorCli,
  stampBaseline,
} from "./migrator.js";
