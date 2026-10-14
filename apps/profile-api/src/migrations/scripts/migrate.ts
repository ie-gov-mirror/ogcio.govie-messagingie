import fs from "node:fs";
import path from "node:path";
import type { DbEnv } from "@ogcio/db-core";
import type { Pool, PoolClient } from "pg";
import Postgrator from "postgrator";

export async function doMigration(
  envDbConfig: DbEnv,
  inputPool: Pool,
  version = "max",
): Promise<void> {
  const client: PoolClient = await inputPool.connect();
  try {
    const migrationDir = path.join(import.meta.dirname, "../sql");

    if (!fs.existsSync(migrationDir)) {
      throw new Error(
        `Migration directory "${migrationDir}" does not exist. Skipping migrations.`,
      );
    }

    const postgrator = new Postgrator({
      migrationPattern: path.join(migrationDir, "*"),
      driver: "pg",
      database: envDbConfig.POSTGRES_DB_NAME,
      execQuery: (query) => client.query(query),
      validateChecksums: false,
    });

    await postgrator.migrate(version);

    console.log("Migration completed!");
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    client.release();
  }
}
