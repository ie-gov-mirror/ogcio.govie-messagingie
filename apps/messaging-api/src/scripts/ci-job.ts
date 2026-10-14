/**
 * This script is intended to be used in CI jobs to run the database migration and any related scripts.
 * It is needed when using DHI images, given that they do not allow using npm or pnpm to run scripts.
 * This will be invoked like `node dist/scripts/ci-job.js` in ci.
 *
 * It runs as an ArgoCD Sync-hook Job (see messaging-k8s-apps/api/base/job.yaml)
 * before the app rolls out, in every environment.
 */

import { fileURLToPath } from "node:url";
import {
  createDbFromPool,
  migrateToLatest,
  stampBaseline,
} from "@ogcio/db-core";
import type { Pool } from "pg";
import { doMigration } from "../migrations/scripts/migrate.js";
import { getDbEnvs, getPgConnection } from "../migrations/scripts/shared.js";
import { syncEventSummaryCommand } from "../migrations/scripts/sync-event-summary.js";

const migrationVersion = "max";
const postgresEnvs = getDbEnvs();

// Directory holding the compiled Kysely migrations (dist/migrations/kysely).
// `0001_baseline` reproduces the schema historically managed by Postgrator.
const kyselyMigrationFolder = fileURLToPath(
  new URL("../migrations/kysely", import.meta.url),
);

async function main(pool: Pool, migrationVersion: string): Promise<void> {
  console.log("");
  console.log("----------------");
  console.log("");

  console.log(
    `Running Postgrator migration for version ${migrationVersion}...`,
  );
  try {
    await doMigration(postgresEnvs, pool, migrationVersion);
  } catch (err) {
    console.error("Error during Postgrator migration", err);
    throw err;
  }
  console.log("Postgrator migration completed.");

  console.log("");
  console.log("----------------");
  console.log("");

  // Kysely bookkeeping. Postgrator still owns schema creation during the
  // transition, so `stampBaseline` only records the baseline as applied
  // (idempotent — stamps existing DBs once, no-ops thereafter) and
  // `migrateToLatest` applies any migrations added after the baseline.
  // The Kysely client wraps the shared pool, so it is NOT destroyed here;
  // the outer `finally` closes the pool for all steps.
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

  console.log("Sync event summary...");

  try {
    await syncEventSummaryCommand(pool, false);
    console.log("Sync event summary completed.");
  } catch (err) {
    console.error("Error during sync event summary", err);
    throw err;
  }
}

const dbEnvs = getDbEnvs();
const pool = getPgConnection(dbEnvs);

try {
  await main(pool, migrationVersion);
} catch {
  process.exit(1);
} finally {
  await pool.end();
}

process.exit(0);
