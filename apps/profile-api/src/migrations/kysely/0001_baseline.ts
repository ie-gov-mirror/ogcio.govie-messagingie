import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type Kysely, sql } from "kysely";

/**
 * 0001_baseline — the single source of schema history going forward.
 *
 * This migration reproduces the schema that was historically managed by the
 * Postgrator SQL migrations in `../sql`. It is created for two audiences:
 *
 *  - Fresh/empty databases: `up` replays the frozen forward SQL files in order
 *    so a brand-new database reaches today's schema in one step.
 *  - Existing databases (already provisioned by Postgrator): the row is
 *    inserted via `pnpm db:stamp-baseline` WITHOUT executing `up`, so the
 *    migrator treats it as already applied and only runs later migrations.
 *
 * The frozen SQL is replayed with two transformations so it runs inside the
 * migrator's transaction:
 *  - standalone `BEGIN;`/`COMMIT;` statements are removed — the migrator
 *    manages the transaction;
 *  - `CONCURRENTLY` is stripped — it is only needed to avoid locking populated
 *    tables in production; on a fresh database plain index creation is
 *    equivalent and is transaction-safe.
 */

const legacySqlDir = fileURLToPath(new URL("../sql", import.meta.url));

// The Postgrator migrations use two forward-file conventions:
//   - `NNN.do.<name>.sql` / `NN.do.<name>.sql`
//   - `NNN_<name>.sql` (e.g. 016_add_performance_indexes.sql)
// Rollback files are `*.undo.*.sql` or `*_rollback.sql`.
const isForwardMigration = (name: string): boolean =>
  /^\d+.*\.sql$/.test(name) &&
  !/\.undo\./i.test(name) &&
  !/_rollback\.sql$/i.test(name);

const sanitizeStatement = (content: string): string =>
  content
    .replace(/^[ \t]*(BEGIN|COMMIT)[ \t]*;[ \t]*$/gim, "")
    .replace(/\bCONCURRENTLY\b/gi, "");

export async function up(db: Kysely<unknown>): Promise<void> {
  const files = (await readdir(legacySqlDir))
    .filter(isForwardMigration)
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

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop every object created by the replayed baseline. Ordered so dependent
  // objects are removed first; CASCADE covers foreign keys and indexes.
  const tables = [
    "announcement_acknowledgements",
    "announcement_translations",
    "announcements",
    "data_lifecycle_tasks",
    "profile_consents",
    "consent_statement_translations",
    "consent_statements",
    "profile_data",
    "profile_details",
    "profile_import_details",
    "profile_imports",
    "profiles",
  ];
  for (const table of tables) {
    await sql.raw(`DROP TABLE IF EXISTS ${table} CASCADE`).execute(db);
  }

  await sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'role_readonly') THEN
        DROP OWNED BY role_readonly;
        DROP ROLE role_readonly;
      END IF;
    END
    $$
  `.execute(db);
}
