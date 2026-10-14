import {
  CamelCasePlugin,
  Kysely,
  type KyselyConfig,
  type LogEvent,
  PostgresDialect,
} from "kysely";
import { Pool, type PoolConfig } from "pg";

/**
 * Connection configuration for {@link createDb}. Mirrors the discrete
 * environment-variable driven setup used by the existing `@fastify/postgres`
 * plugins across the OGCIO APIs, while also supporting a plain connection
 * string (used by tests and CI).
 */
export interface DbCoreConfig {
  /** Full connection string. When set, the discrete fields are ignored. */
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  /** Passed straight through to node-postgres. `false` disables SSL. */
  ssl?: PoolConfig["ssl"];
  /** Extra node-postgres pool options (max, idleTimeoutMillis, ...). */
  pool?: Omit<
    PoolConfig,
    | "connectionString"
    | "host"
    | "port"
    | "user"
    | "password"
    | "database"
    | "ssl"
  >;
  /** Optional Kysely query logger. */
  log?: (event: LogEvent) => void;
}

/**
 * Build a node-postgres {@link Pool} from a {@link DbCoreConfig}, mirroring the
 * SSL handling of the existing pg plugin.
 */
export const createPool = (config: DbCoreConfig): Pool => {
  if (config.connectionString) {
    return new Pool({
      connectionString: config.connectionString,
      ssl: config.ssl ?? false,
      ...config.pool,
    });
  }

  return new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl ?? false,
    ...config.pool,
  });
};

/**
 * Wrap an existing node-postgres {@link Pool} in a typed Kysely instance using
 * the Postgres dialect and the {@link CamelCasePlugin} so snake_case columns in
 * the database map to camelCase properties in TypeScript.
 *
 * Reusing a pool lets Kysely (`app.db`) and `@fastify/postgres` (`app.pg`)
 * share a single connection pool during the incremental cutover.
 */
export const createDbFromPool = <DB>(
  pool: Pool,
  options: Pick<DbCoreConfig, "log"> = {},
): Kysely<DB> => {
  const kyselyConfig: KyselyConfig = {
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
    ...(options.log ? { log: options.log } : {}),
  };
  return new Kysely<DB>(kyselyConfig);
};

/**
 * Bootstrap a typed Kysely instance from a {@link DbCoreConfig}. Creates a
 * dedicated node-postgres pool. Use {@link createDbFromPool} to share an
 * existing pool instead.
 */
export const createDb = <DB>(config: DbCoreConfig): Kysely<DB> =>
  createDbFromPool<DB>(createPool(config), { log: config.log });
