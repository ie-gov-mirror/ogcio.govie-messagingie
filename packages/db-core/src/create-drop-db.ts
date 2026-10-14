import pg, { type Client } from "pg";
import { type DbEnv, POSTGRES_MAINTENANCE_DB } from "./env-connection.js";

// DDL (CREATE/DROP DATABASE) cannot use bind parameters, so the database name is
// interpolated directly. Restrict it to a safe identifier whitelist to prevent
// SQL injection via a crafted `POSTGRES_DB_NAME`.
const DB_IDENTIFIER = /^[a-zA-Z0-9_]+$/;

const assertValidDbName = (name: string): void => {
  if (!DB_IDENTIFIER.test(name)) {
    throw new Error(
      `Invalid database name "${name}": must match ${DB_IDENTIFIER}`,
    );
  }
};

// Connect to the maintenance database so we can create/drop the target one
// (you cannot drop the database you are connected to).
const maintenanceClient = (env: DbEnv): Client =>
  new pg.Client({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: POSTGRES_MAINTENANCE_DB,
  });

/** Create the application database if it does not already exist. Idempotent. */
export const createDatabaseIfNotExists = async (env: DbEnv): Promise<void> => {
  assertValidDbName(env.POSTGRES_DB_NAME);
  const client = maintenanceClient(env);

  try {
    await client.connect();
    const res = await client.query<{ datname: string }>(
      "SELECT datname FROM pg_catalog.pg_database WHERE datname = $1",
      [env.POSTGRES_DB_NAME],
    );
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE ${env.POSTGRES_DB_NAME}`);
    }
    console.log(`Database ${env.POSTGRES_DB_NAME} created or already exists.`);
  } catch (err) {
    console.error("Creating db", err);
    throw err;
  } finally {
    await client.end();
  }
};

/** Drop the application database. Refuses to drop the maintenance database. */
export const dropDatabase = async (env: DbEnv): Promise<void> => {
  if (env.POSTGRES_DB_NAME === POSTGRES_MAINTENANCE_DB) {
    throw new Error(`You can't drop ${POSTGRES_MAINTENANCE_DB}`);
  }
  assertValidDbName(env.POSTGRES_DB_NAME);
  const client = maintenanceClient(env);

  try {
    await client.connect();
    await client.query(`DROP DATABASE ${env.POSTGRES_DB_NAME}`);
    console.log(`Database ${env.POSTGRES_DB_NAME} dropped.`);
  } catch (err) {
    console.error("Dropping db", err);
    throw err;
  } finally {
    await client.end();
  }
};
