import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { type Kysely, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../src/db.js";
import {
  DEFAULT_MIGRATION_TABLE,
  makeMigration,
  migrateDown,
  migrateToLatest,
  runMigratorCli,
  stampBaseline,
} from "../src/migrator.js";

let container: StartedPostgreSqlContainer;
let db: Kysely<unknown>;
let migrationFolder: string;

// Migration fixtures use only the injected Kysely `db` (no imports) so the
// generated files resolve regardless of where the temp folder lives.
//
// The baseline `up` would throw if executed against a database that already has
// the table (no IF NOT EXISTS) — proving that stamping skips execution.
const BASELINE_MIGRATION = `export async function up(db) {
  await db.schema.createTable("baseline_widgets")
    .addColumn("id", "serial", (c) => c.primaryKey())
    .addColumn("name", "text")
    .execute();
}
export async function down(db) {
  await db.schema.dropTable("baseline_widgets").execute();
}
`;

const SECOND_MIGRATION = `export async function up(db) {
  await db.schema.alterTable("baseline_widgets")
    .addColumn("qty", "integer", (c) => c.notNull().defaultTo(0))
    .execute();
}
export async function down(db) {
  await db.schema.alterTable("baseline_widgets").dropColumn("qty").execute();
}
`;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = createDb({ connectionString: container.getConnectionUri() });

  migrationFolder = await fs.mkdtemp(
    path.join(os.tmpdir(), "db-core-migrations-"),
  );
  await fs.writeFile(
    path.join(migrationFolder, "0001_baseline.mjs"),
    BASELINE_MIGRATION,
  );
  await fs.writeFile(
    path.join(migrationFolder, "0002_add_qty.mjs"),
    SECOND_MIGRATION,
  );
}, 120_000);

afterAll(async () => {
  await db?.destroy();
  await container?.stop();
  if (migrationFolder) {
    await fs.rm(migrationFolder, { recursive: true, force: true });
  }
});

describe("stampBaseline", () => {
  it("inserts the baseline row once and is idempotent", async () => {
    const first = await stampBaseline({ db, name: "0001_baseline" });
    expect(first).toBe(true);

    const second = await stampBaseline({ db, name: "0001_baseline" });
    expect(second).toBe(false);

    const rows = await sql<{
      name: string;
    }>`SELECT name FROM ${sql.ref(DEFAULT_MIGRATION_TABLE)} WHERE name = '0001_baseline'`.execute(
      db,
    );
    expect(rows.rows).toHaveLength(1);
  });

  it("migrateToLatest skips the stamped baseline and runs later migrations", async () => {
    // Simulate an existing DB: the baseline table already exists. If the
    // baseline migration were executed it would throw (table already exists).
    await sql`CREATE TABLE IF NOT EXISTS baseline_widgets (id serial PRIMARY KEY, name text)`.execute(
      db,
    );

    await migrateToLatest({ db, migrationFolder });

    // The later migration should have added the qty column. Note the active
    // CamelCasePlugin maps result keys, so `column_name` arrives as `columnName`.
    const columns = await sql<{
      columnName: string;
    }>`SELECT column_name FROM information_schema.columns WHERE table_name = 'baseline_widgets'`.execute(
      db,
    );
    const names = columns.rows.map((r) => r.columnName);
    expect(names).toContain("qty");

    // Both migrations should be recorded as applied.
    const applied = await sql<{
      name: string;
    }>`SELECT name FROM ${sql.ref(DEFAULT_MIGRATION_TABLE)} ORDER BY name`.execute(
      db,
    );
    expect(applied.rows.map((r) => r.name)).toEqual([
      "0001_baseline",
      "0002_add_qty",
    ]);
  });
});

const tableExists = async (name: string): Promise<boolean> => {
  const { rows } = await sql<{ exists: boolean }>`
    SELECT to_regclass(${name}) IS NOT NULL AS "exists"
  `.execute(db);
  return rows[0]?.exists ?? false;
};

describe("migrateDown", () => {
  it("rolls back the most recently applied migration", async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "db-core-down-"));
    await fs.writeFile(
      path.join(folder, "0001_thing.mjs"),
      `export async function up(db) {
         await db.schema.createTable("down_thing")
           .addColumn("id", "serial", (c) => c.primaryKey())
           .execute();
       }
       export async function down(db) {
         await db.schema.dropTable("down_thing").execute();
       }`,
    );
    const options = {
      db,
      migrationFolder: folder,
      migrationTableName: "down_migrations",
      migrationLockTableName: "down_migrations_lock",
    };

    await migrateToLatest(options);
    expect(await tableExists("down_thing")).toBe(true);

    await migrateDown(options);
    expect(await tableExists("down_thing")).toBe(false);

    await fs.rm(folder, { recursive: true, force: true });
  });
});

describe("makeMigration", () => {
  it("writes a timestamped template file and returns its path", async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "db-core-make-"));

    const filePath = await makeMigration({
      migrationFolder: folder,
      name: "Add Foo Bar!!",
    });

    expect(path.basename(filePath)).toMatch(/^\d{14}_add_foo_bar\.ts$/);
    const contents = await fs.readFile(filePath, "utf8");
    expect(contents).toContain("export async function up(");
    expect(contents).toContain("export async function down(");

    await fs.rm(folder, { recursive: true, force: true });
  });

  it("throws when the name has no alphanumeric characters", async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "db-core-make-"));
    await expect(
      makeMigration({ migrationFolder: folder, name: "!!!" }),
    ).rejects.toThrow("Migration name must contain alphanumeric characters");
    await fs.rm(folder, { recursive: true, force: true });
  });
});

describe("runMigratorCli", () => {
  const base = { db, migrationFolder: "/tmp/does-not-matter" };

  it("throws on an unknown command", async () => {
    await expect(
      runMigratorCli({ ...base, argv: ["node", "cli", "bogus"] }),
    ).rejects.toThrow(/Unknown migrator command/);
  });

  it("throws when migrate:make is missing a name", async () => {
    await expect(
      runMigratorCli({ ...base, argv: ["node", "cli", "migrate:make"] }),
    ).rejects.toThrow("Usage: migrate:make <name>");
  });

  it("throws when stamp-baseline has neither an arg nor a baselineName", async () => {
    await expect(
      runMigratorCli({ ...base, argv: ["node", "cli", "stamp-baseline"] }),
    ).rejects.toThrow(/Usage: stamp-baseline/);
  });
});

describe("stampBaseline with a custom migration table name", () => {
  it("records the baseline in the custom table and stays idempotent", async () => {
    const migrationTableName = "custom_migrations";

    const first = await stampBaseline({
      db,
      name: "0001_custom",
      migrationTableName,
      migrationLockTableName: "custom_migrations_lock",
    });
    expect(first).toBe(true);

    const second = await stampBaseline({
      db,
      name: "0001_custom",
      migrationTableName,
      migrationLockTableName: "custom_migrations_lock",
    });
    expect(second).toBe(false);

    const rows = await sql<{
      name: string;
    }>`SELECT name FROM ${sql.ref(migrationTableName)} WHERE name = '0001_custom'`.execute(
      db,
    );
    expect(rows.rows).toHaveLength(1);
  });
});
