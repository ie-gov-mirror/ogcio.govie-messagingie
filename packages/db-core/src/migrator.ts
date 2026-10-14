import { promises as fs } from "node:fs";
import path from "node:path";
import { type Kysely, sql } from "kysely";
import {
  FileMigrationProvider,
  type MigrationResultSet,
  Migrator,
  type MigratorProps,
} from "kysely/migration";

export const DEFAULT_MIGRATION_TABLE = "kysely_migration";
export const DEFAULT_MIGRATION_LOCK_TABLE = "kysely_migration_lock";

export interface MigratorOptions {
  db: Kysely<unknown>;
  /** Absolute path to the directory that holds migration files. */
  migrationFolder: string;
  migrationTableName?: string;
  migrationLockTableName?: string;
}

/**
 * Build a Kysely {@link Migrator} backed by a {@link FileMigrationProvider}.
 */
export const createMigrator = (options: MigratorOptions): Migrator => {
  const props: MigratorProps = {
    db: options.db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: options.migrationFolder,
    }),
    migrationTableName: options.migrationTableName ?? DEFAULT_MIGRATION_TABLE,
    migrationLockTableName:
      options.migrationLockTableName ?? DEFAULT_MIGRATION_LOCK_TABLE,
  };
  return new Migrator(props);
};

const logResults = (action: string, results: MigrationResultSet): void => {
  const { error, results: migrations } = results;
  for (const result of migrations ?? []) {
    if (result.status === "Success") {
      console.log(`[${action}] applied "${result.migrationName}"`);
    } else if (result.status === "Error") {
      console.error(`[${action}] failed "${result.migrationName}"`);
    }
  }
  if (error) {
    console.error(`[${action}] error:`, error);
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (!migrations || migrations.length === 0) {
    console.log(`[${action}] no migrations to run`);
  }
};

/** Apply all pending migrations. */
export const migrateToLatest = async (
  options: MigratorOptions,
): Promise<void> => {
  const migrator = createMigrator(options);
  logResults("migrate:latest", await migrator.migrateToLatest());
};

/** Roll back the most recently applied migration. */
export const migrateDown = async (options: MigratorOptions): Promise<void> => {
  const migrator = createMigrator(options);
  logResults("migrate:down", await migrator.migrateDown());
};

const MIGRATION_TEMPLATE = `import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // TODO: implement the forward migration.
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // TODO: implement the rollback. \`down\` is mandatory.
}
`;

/**
 * Scaffold a new timestamped migration file `<timestamp>_<name>.ts` inside the
 * migration folder and return its absolute path.
 */
export const makeMigration = async (options: {
  migrationFolder: string;
  name: string;
}): Promise<string> => {
  const safeName = options.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!safeName) {
    throw new Error("Migration name must contain alphanumeric characters");
  }
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
    .replace("T", "");
  // `safeName` is already restricted to `[a-z0-9_]`, so `fileName` can never
  // contain path separators; `path.basename` is a defensive belt-and-braces
  // guard that also makes the absence of path traversal explicit to scanners.
  const fileName = path.basename(`${stamp}_${safeName}.ts`);
  const filePath = path.join(options.migrationFolder, fileName);
  await fs.mkdir(options.migrationFolder, { recursive: true });
  await fs.writeFile(filePath, MIGRATION_TEMPLATE, { flag: "wx" });
  console.log(`[migrate:make] created ${filePath}`);
  return filePath;
};

/**
 * Ensure the Kysely migration bookkeeping tables exist, matching the schema the
 * {@link Migrator} would create on first run. Safe to call repeatedly.
 */
const ensureMigrationTables = async (options: {
  db: Kysely<unknown>;
  migrationTableName: string;
  migrationLockTableName: string;
}): Promise<void> => {
  await options.db.schema
    .createTable(options.migrationTableName)
    .ifNotExists()
    .addColumn("name", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("timestamp", "varchar(255)", (col) => col.notNull())
    .execute();

  await options.db.schema
    .createTable(options.migrationLockTableName)
    .ifNotExists()
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("is_locked", "integer", (col) => col.notNull().defaultTo(0))
    .execute();
};

/**
 * Stamp a baseline migration as already-applied WITHOUT executing it. Inserts a
 * row into the Kysely migration table so existing databases (whose schema was
 * created by a previous migration tool) treat the baseline as done and only run
 * subsequent migrations. Idempotent.
 *
 * @returns `true` if a new row was inserted, `false` if it already existed.
 */
export const stampBaseline = async (options: {
  db: Kysely<unknown>;
  /** Migration name to stamp, e.g. `0001_baseline`. Must match the file name. */
  name: string;
  migrationTableName?: string;
  migrationLockTableName?: string;
}): Promise<boolean> => {
  const migrationTableName =
    options.migrationTableName ?? DEFAULT_MIGRATION_TABLE;
  const migrationLockTableName =
    options.migrationLockTableName ?? DEFAULT_MIGRATION_LOCK_TABLE;

  await ensureMigrationTables({
    db: options.db,
    migrationTableName,
    migrationLockTableName,
  });

  // The migration bookkeeping table is not part of the application's DB type.
  // biome-ignore lint/suspicious/noExplicitAny: migration table is not in the app DB type
  const looseDb = options.db as unknown as Kysely<any>;
  const inserted = await looseDb
    .insertInto(migrationTableName)
    .values({
      name: options.name,
      timestamp: new Date().toISOString(),
    })
    // biome-ignore lint/suspicious/noExplicitAny: dynamic column reference
    .onConflict((oc: any) => oc.column("name").doNothing())
    .returningAll()
    .execute();

  const didInsert = inserted.length > 0;
  console.log(
    didInsert
      ? `[stamp-baseline] stamped "${options.name}" as applied`
      : `[stamp-baseline] "${options.name}" already stamped, nothing to do`,
  );
  return didInsert;
};

export interface MigratorCliOptions extends MigratorOptions {
  /** Default baseline migration name used by the `stamp-baseline` command. */
  baselineName?: string;
  /** Argument vector; defaults to `process.argv`. */
  argv?: string[];
}

/**
 * Tiny command dispatcher used by each API's migration script. Supports
 * `migrate:latest`, `migrate:down`, `migrate:make <name>` and `stamp-baseline`.
 */
export const runMigratorCli = async (
  options: MigratorCliOptions,
): Promise<void> => {
  const argv = options.argv ?? process.argv;
  const command = argv[2];
  const arg = argv[3];

  switch (command) {
    case "migrate:latest":
    case "latest":
      await migrateToLatest(options);
      return;
    case "migrate:down":
    case "down":
      await migrateDown(options);
      return;
    case "migrate:make":
    case "make": {
      if (!arg) {
        throw new Error("Usage: migrate:make <name>");
      }
      await makeMigration({
        migrationFolder: options.migrationFolder,
        name: arg,
      });
      return;
    }
    case "stamp-baseline": {
      const name = arg ?? options.baselineName;
      if (!name) {
        throw new Error(
          "Usage: stamp-baseline <name> (or set baselineName in the script)",
        );
      }
      await stampBaseline({
        db: options.db,
        name,
        migrationTableName: options.migrationTableName,
        migrationLockTableName: options.migrationLockTableName,
      });
      return;
    }
    default:
      throw new Error(
        `Unknown migrator command "${command ?? ""}". Expected one of: migrate:latest, migrate:down, migrate:make <name>, stamp-baseline`,
      );
  }
};

export { sql };
