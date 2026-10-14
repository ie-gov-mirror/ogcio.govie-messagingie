import {
  type DbEnv,
  getDbEnv,
  getPgConnection as getPgConnectionCore,
  POSTGRES_MAINTENANCE_DB,
} from "@ogcio/db-core";
import type { Pool, PoolConfig } from "pg";

// The CA bundle ships with the app; db-core keeps the path caller-supplied.
const caCertPath = new URL(
  "../../certificates/global-bundle.pem",
  import.meta.url,
).pathname;

// profile-api's env schema names the database `POSTGRES_DATABASE`, while
// db-core's shared `DbEnv` uses `POSTGRES_DB_NAME`. Bridge that single field at
// the process.env boundary and delegate all validation/connection/SSL handling
// to db-core (no duplicated validation loop or SSL plumbing here).
export const getDbEnvs = (): DbEnv =>
  getDbEnv({ ...process.env, POSTGRES_DB_NAME: process.env.POSTGRES_DATABASE });

export const getPgConnection = (
  config: DbEnv | string,
  additionalConfig?: Partial<PoolConfig>,
): Pool => getPgConnectionCore(config, additionalConfig, { caCertPath });

export const POSTGRES_DB_NAME = POSTGRES_MAINTENANCE_DB;
