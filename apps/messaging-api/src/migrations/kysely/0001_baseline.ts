import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type Kysely, sql } from "kysely";

/**
 * 0001_baseline — the single source of schema history going forward.
 *
 * This migration reproduces the schema that was historically managed by the
 * Postgrator SQL migrations in `../sql`. It is created for two audiences:
 *
 *  - Fresh/empty databases: `up` replays the frozen `*.do.sql` files in order
 *    so a brand-new database reaches today's schema in one step.
 *  - Existing databases (already provisioned by Postgrator): the row is
 *    inserted via `pnpm db:stamp-baseline` WITHOUT executing `up`, so the
 *    migrator treats it as already applied and only runs later migrations.
 *
 * The frozen SQL is replayed with two transformations so it runs inside the
 * migrator's transaction:
 *  - standalone `BEGIN;`/`COMMIT;` statements (from 001) are removed — the
 *    migrator manages the transaction;
 *  - `CONCURRENTLY` is stripped — it is only needed to avoid locking populated
 *    tables in production; on a fresh database plain index creation is
 *    equivalent and is transaction-safe.
 */

const legacySqlDir = fileURLToPath(new URL("../sql", import.meta.url));

const sanitizeStatement = (content: string): string =>
  content
    .replace(/^[ \t]*(BEGIN|COMMIT)[ \t]*;[ \t]*$/gim, "")
    .replace(/\bCONCURRENTLY\b/gi, "");

export async function up(db: Kysely<unknown>): Promise<void> {
  const files = (await readdir(legacySqlDir))
    .filter((name) => /^\d+\.do\..*\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  for (const file of files) {
    const raw = await readFile(`${legacySqlDir}/${file}`, "utf8");
    const statement = sanitizeStatement(raw).trim();
    if (statement.length === 0) {
      continue;
    }
    await sql.raw(statement).execute(db);
  }
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Baseline is intentionally irreversible: never drop production tables/data.
}
