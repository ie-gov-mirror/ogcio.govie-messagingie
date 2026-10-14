import {
  type DbEnv,
  type FastifyKyselyOptions,
  fastifyKysely,
  type Kysely,
  kyselyAutoConfigFromEnv,
} from "@ogcio/db-core";
import type { FastifyInstance } from "fastify";
import type { DB } from "../../db/schema.js";

// The CA bundle ships with the app; used only when POSTGRES_SSL is enabled.
const caCertPath = new URL(
  "../../certificates/global-bundle.pem",
  import.meta.url,
).pathname;

declare module "fastify" {
  interface FastifyInstance {
    /**
     * Typed Kysely client. Coexists with `@fastify/postgres` (`app.pg`) during
     * the incremental cutover to the db-core data-access layer.
     */
    db: Kysely<DB>;
  }
}

// Mirrors the pool/SSL configuration of the existing `@fastify/postgres`
// registration in `app.ts` so `app.db` and `app.pg` target the same database.
// `app.config` is @fastify/env's loose index signature; assert the DB subset.
export const autoConfig = (fastify: FastifyInstance): FastifyKyselyOptions =>
  kyselyAutoConfigFromEnv(
    { config: fastify.config as unknown as DbEnv },
    { caCertPath },
  );

export default fastifyKysely;
