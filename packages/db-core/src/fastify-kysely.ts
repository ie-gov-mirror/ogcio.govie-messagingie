import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { Kysely } from "kysely";
import type { Pool } from "pg";
import { createDbFromPool, createPool, type DbCoreConfig } from "./db.js";
import { type DbEnv, getSslConfig } from "./env-connection.js";

export type FastifyKyselyOptions = DbCoreConfig & {
  /**
   * Reuse an existing node-postgres pool (e.g. `app.pg.pool`) instead of
   * creating a dedicated one. When set, the pool is NOT closed on shutdown —
   * its owner (e.g. `@fastify/postgres`) is responsible for that.
   */
  existingPool?: Pool;
  /** Name of the decorator to attach the Kysely instance to. Defaults to `db`. */
  decoratorName?: string;
};

/**
 * Fastify plugin that decorates the instance with a typed Kysely client
 * (`app.db` by default). Designed to coexist with `@fastify/postgres`
 * (`app.pg`) so domains can be migrated incrementally.
 *
 * Consuming apps typically wrap this in `src/plugins/external/kysely.ts`,
 * re-exporting it as the default export and providing an `autoConfig` that
 * mirrors their existing pg pool/SSL configuration.
 */
export const fastifyKysely: FastifyPluginAsync<FastifyKyselyOptions> = fp(
  async (app: FastifyInstance, opts: FastifyKyselyOptions) => {
    const decoratorName = opts.decoratorName ?? "db";
    const ownsPool = opts.existingPool === undefined;
    const pool = opts.existingPool ?? createPool(opts);
    const db: Kysely<unknown> = createDbFromPool(pool, { log: opts.log });

    app.decorate(decoratorName, db);

    app.addHook("onClose", async () => {
      // Destroying Kysely ends the underlying pool; only do so when we own it.
      if (ownsPool) {
        await db.destroy();
      }
    });
  },
  { name: "fastify-kysely", fastify: "5.x" },
);

/**
 * Build {@link FastifyKyselyOptions} from a Fastify instance's `config` (the
 * discrete `POSTGRES_*` env vars). Returns a connection-string config when
 * `DATABASE_TEST_URL` is set, otherwise discrete host/port/... with SSL resolved
 * via {@link getSslConfig}. The `db: Kysely<DB>` decorator augmentation stays in
 * the consuming app since it needs the app's `DB` type — this only builds opts.
 */
export const kyselyAutoConfigFromEnv = (
  fastify: { config: DbEnv },
  options: { caCertPath?: string } = {},
): FastifyKyselyOptions => {
  if (process.env.DATABASE_TEST_URL) {
    return { connectionString: process.env.DATABASE_TEST_URL };
  }

  const env = fastify.config;
  return {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB_NAME,
    ssl: getSslConfig(env.POSTGRES_SSL, { caCertPath: options.caCertPath }),
  };
};

export default fastifyKysely;
