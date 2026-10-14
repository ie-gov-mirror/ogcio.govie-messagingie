/**
 * This file is responsible to run startup jobs during deployment.
 * We created this single file in this path because the k8s job was pointing to this path
 * and we wanted to keep all migration related scripts in the same folder to avoid having to
 * change the job definition one deployment a time.
 * We could remove this file and use a script in another path once we've deployed the
 * postgrator code to all environments.
 */

import { fileURLToPath } from "node:url";
import {
  createDbFromPool,
  type DbEnv,
  migrateToLatest,
  stampBaseline,
} from "@ogcio/db-core";
import type { Pool } from "pg";
import { doMigration } from "../migrations/scripts/migrate.js";
import { getDbEnvs, getPgConnection } from "../migrations/scripts/shared.js";

// Directory holding the compiled Kysely migrations (dist/migrations/kysely).
// `0001_baseline` reproduces the schema historically managed by Postgrator.
const kyselyMigrationFolder = fileURLToPath(
  new URL("../migrations/kysely", import.meta.url),
);

async function main(pgEnvs: DbEnv, pool: Pool, migrationVersion: string) {
  console.log("");
  console.log("----------------");
  console.log("");
  console.log("Starting migration");

  try {
    await doMigration(pgEnvs, pool, migrationVersion);
  } catch (err) {
    console.error("Error during migration", err);
    throw err;
  }

  console.log("");
  console.log("Migration finished successfully");
  console.log("");
  console.log("----------------");
  console.log("");

  // Kysely bookkeeping. Postgrator still owns schema creation during the
  // transition, so `stampBaseline` only records the baseline as applied
  // (idempotent — stamps existing DBs once, no-ops thereafter) and
  // `migrateToLatest` applies any migrations added after the baseline.
  // The Kysely client wraps the shared pool, so it is NOT destroyed here;
  // the caller closes the pool for all steps.
  console.log("Stamping Kysely baseline and applying Kysely migrations...");
  const db = createDbFromPool(pool);
  try {
    await stampBaseline({ db, name: "0001_baseline" });
    await migrateToLatest({ db, migrationFolder: kyselyMigrationFolder });
  } catch (err) {
    console.error("Error during Kysely migrations", err);
    throw err;
  }
  console.log("Kysely migrations completed.");
  console.log("");
  console.log("----------------");
  console.log("");
}

const pgEnvs = getDbEnvs();
const pgConnection = getPgConnection(pgEnvs);
const migrationVersion = "max";

try {
  await main(pgEnvs, pgConnection, migrationVersion);
} catch {
  process.exit(1);
} finally {
  await pgConnection.end();
}

process.exit(0);
