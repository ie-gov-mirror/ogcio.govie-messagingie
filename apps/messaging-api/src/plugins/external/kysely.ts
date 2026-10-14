import path from "node:path";
import {
  type FastifyKyselyOptions,
  fastifyKysely,
  type Kysely,
  kyselyAutoConfigFromEnv,
} from "@ogcio/db-core";
import type { FastifyInstance } from "fastify";
import type { DB } from "../../db/schema.js";

declare module "fastify" {
  interface FastifyInstance {
    /**
     * Typed Kysely client. Coexists with `@fastify/postgres` (`app.pg`) during
     * the incremental cutover to the db-core data-access layer.
     */
    db: Kysely<DB>;
  }
}

// Mirrors the pool/SSL configuration of the existing `pg` plugin so `app.db`
// and `app.pg` target the same database. The CA bundle ships with the app.
export const autoConfig = (fastify: FastifyInstance): FastifyKyselyOptions =>
  kyselyAutoConfigFromEnv(fastify, {
    caCertPath: path.resolve(fastify.dirname, "certificates/global-bundle.pem"),
  });

export default fastifyKysely;
