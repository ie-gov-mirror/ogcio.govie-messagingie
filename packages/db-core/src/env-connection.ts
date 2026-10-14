import { readFileSync } from "node:fs";
import { Pool, type PoolConfig } from "pg";

/**
 * The Postgres maintenance database every server ships with. Used as the
 * connection target when creating/dropping application databases (you cannot
 * drop the database you are connected to).
 */
export const POSTGRES_MAINTENANCE_DB = "postgres";

/**
 * Discrete, environment-variable driven database configuration shared by the
 * OGCIO backend APIs. Structurally matches each app's local `EnvDbConfig`, so
 * app config objects can be passed straight through.
 */
export interface DbEnv {
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_DB_NAME: string;
  POSTGRES_SSL?: boolean;
}

type EnvSource = Record<string, string | undefined>;

const REQUIRED_DB_ENV_KEYS = [
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_DB_NAME",
] as const;

/**
 * Read and validate the discrete database environment variables, throwing when
 * a required one is missing or the port is not numeric. `POSTGRES_SSL` is
 * optional and coerced from the string `"true"` (case-insensitive) to a boolean.
 */
export const getDbEnv = (env: EnvSource = process.env): DbEnv => {
  const missing = REQUIRED_DB_ENV_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required database environment variable(s): ${missing.join(", ")}`,
    );
  }

  const port = Number(env.POSTGRES_PORT);
  if (!Number.isFinite(port)) {
    throw new Error(
      `Invalid POSTGRES_PORT: "${env.POSTGRES_PORT}" is not a number`,
    );
  }

  return {
    POSTGRES_USER: env.POSTGRES_USER as string,
    POSTGRES_PASSWORD: env.POSTGRES_PASSWORD as string,
    POSTGRES_HOST: env.POSTGRES_HOST as string,
    POSTGRES_PORT: port,
    POSTGRES_DB_NAME: env.POSTGRES_DB_NAME as string,
    POSTGRES_SSL: env.POSTGRES_SSL?.toLowerCase() === "true",
  };
};

/** Backward-compatible alias matching the apps' existing `getDbEnvs` call sites. */
export const getDbEnvs = getDbEnv;

/**
 * Resolve the node-postgres `ssl` option from a boolean flag. When SSL is off
 * returns `false`; when on, reads the caller-supplied CA bundle (the cert ships
 * per-app, so the path is never hardcoded here) and disables hostname
 * verification, mirroring the existing `@fastify/postgres` setup.
 */
export const getSslConfig = (
  ssl: boolean | undefined,
  options: { caCertPath?: string } = {},
): PoolConfig["ssl"] => {
  if (!ssl) {
    return false;
  }
  if (!options.caCertPath) {
    throw new Error("getSslConfig: caCertPath is required when SSL is enabled");
  }
  return {
    rejectUnauthorized: false,
    ca: readFileSync(options.caCertPath),
  };
};

/**
 * Build a node-postgres {@link Pool} from a {@link DbEnv} or a plain connection
 * string. A string is used verbatim (tests/CI); discrete fields apply SSL via
 * {@link getSslConfig}. `additionalConfig` is spread last so callers can tune
 * pool options (e.g. `idleTimeoutMillis`).
 */
export const getPgConnection = (
  config: DbEnv | string,
  additionalConfig?: Partial<PoolConfig>,
  options: { caCertPath?: string } = {},
): Pool => {
  if (typeof config === "string") {
    return new Pool({ connectionString: config, ...additionalConfig });
  }

  if (config.POSTGRES_SSL) {
    console.log("Using SSL for PostgreSQL connection");
  }

  return new Pool({
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    database: config.POSTGRES_DB_NAME,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    ssl: getSslConfig(config.POSTGRES_SSL, { caCertPath: options.caCertPath }),
    ...additionalConfig,
  });
};

/** Build a `postgresql://` connection string, URL-encoding the credentials. */
export const toConnectionString = (env: DbEnv): string => {
  const auth = `${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(
    env.POSTGRES_PASSWORD,
  )}`;
  return `postgresql://${auth}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB_NAME}`;
};
