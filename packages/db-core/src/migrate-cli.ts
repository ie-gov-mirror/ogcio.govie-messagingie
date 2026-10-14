import { createDbFromPool } from "./db.js";
import { type DbEnv, getDbEnv, getPgConnection } from "./env-connection.js";
import { runMigratorCli } from "./migrator.js";

export interface KyselyMigrateCliOptions {
  /** Absolute path to the directory holding the Kysely migration files. */
  migrationFolder: string;
  /** Default baseline migration name for the `stamp-baseline` command. */
  baselineName?: string;
  /**
   * Connection to migrate. Defaults to `DATABASE_TEST_URL` (if set) or the
   * discrete `POSTGRES_*` env vars via {@link getDbEnv}.
   */
  connection?: DbEnv | string;
  /** Argument vector; defaults to `process.argv`. */
  argv?: string[];
  /** CA bundle path used only when the resolved connection enables SSL. */
  caCertPath?: string;
}

/**
 * End-to-end Kysely migration CLI runner: builds a pool from the resolved
 * connection, wraps it in Kysely, dispatches the migrator command, sets a
 * failing exit code on error, and always destroys the connection. Mirrors the
 * per-app `db/migrate.ts` scripts so they collapse to a single call.
 */
export const runKyselyMigrateCli = async (
  options: KyselyMigrateCliOptions,
): Promise<void> => {
  const connection =
    options.connection ?? process.env.DATABASE_TEST_URL ?? getDbEnv();
  const pool = getPgConnection(connection, undefined, {
    caCertPath: options.caCertPath,
  });
  const db = createDbFromPool(pool);

  try {
    await runMigratorCli({
      db,
      migrationFolder: options.migrationFolder,
      baselineName: options.baselineName,
      argv: options.argv,
    });
  } catch (error) {
    console.error("Migration command failed", error);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
};
