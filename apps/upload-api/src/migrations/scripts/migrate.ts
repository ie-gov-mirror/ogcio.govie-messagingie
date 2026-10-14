import fs from "node:fs";
import path from "node:path";
import type { DbEnv } from "@ogcio/db-core";
import type { Pool } from "pg";
import Postgrator from "postgrator";

export async function doMigration(
  envDbConfig: DbEnv,
  pool: Pool,
  version = "max",
): Promise<void> {
  const client = await pool.connect();

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
      execQuery: (query) => {
        return client.query(query);
      },
      execSqlScript: async (sqlScript) => {
        await client.query(sqlScript);
      },
      validateChecksums: false,
    });

    const migrated = await postgrator.migrate(version);
    console.log("List of executed migrations: ");
    for (const migration of migrated) {
      console.log(migration.name);
    }
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    client.release();
  }
}
