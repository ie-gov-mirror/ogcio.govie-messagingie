import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "@fastify/postgres";
import type { FastifyInstance } from "fastify";
import type { PoolConfig } from "pg";

const connectionTimeoutMillis = 5_000;

export const autoConfig = (fastify: FastifyInstance): PoolConfig => {
  if (process.env.DATABASE_TEST_URL) {
    return {
      connectionString: process.env.DATABASE_TEST_URL,
      connectionTimeoutMillis,
    };
  }

  let sslConfig: PoolConfig["ssl"] = false;
  if (fastify.config.POSTGRES_SSL) {
    const certificatePath = path.resolve(
      fastify.dirname,
      "certificates/global-bundle.pem",
    );

    const ca = readFileSync(certificatePath);
    sslConfig = {
      rejectUnauthorized: false,
      ca,
    };
  }

  return {
    host: fastify.config.POSTGRES_HOST,
    port: fastify.config.POSTGRES_PORT,
    user: fastify.config.POSTGRES_USER,
    password: fastify.config.POSTGRES_PASSWORD,
    database: fastify.config.POSTGRES_DATABASE,
    ssl: sslConfig,
    connectionTimeoutMillis,
  };
};

export default pg;
