import {
  type DbEnv,
  getDbEnv,
  getPgConnection as getPgConnectionCore,
  getSslConfig as getSslConfigCore,
  POSTGRES_MAINTENANCE_DB,
} from "@ogcio/db-core";
import type { Pool, PoolConfig } from "pg";

// The CA bundle ships with the app; db-core keeps the path caller-supplied.
const caCertPath = new URL(
  "../../certificates/global-bundle.pem",
  import.meta.url,
).pathname;

export const getDbEnvs = (): DbEnv => getDbEnv();

export const getSslConfig = (ssl: boolean): PoolConfig["ssl"] =>
  getSslConfigCore(ssl, { caCertPath });

export const getPgConnection = (
  envDbConfig: DbEnv | string,
  additionalConfig?: Partial<PoolConfig>,
): Pool => getPgConnectionCore(envDbConfig, additionalConfig, { caCertPath });

export const POSTGRES_DB_NAME = POSTGRES_MAINTENANCE_DB;
