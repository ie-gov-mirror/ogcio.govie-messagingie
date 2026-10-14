import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import v8 from "node:v8";
import fastifyEnv from "@fastify/env";
import postgres from "@fastify/postgres";
import sensible, { httpErrors } from "@fastify/sensible";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import fastifyUnderPressure from "@fastify/under-pressure";
import { initializeErrorHandler } from "@ogcio/fastify-error-handler";
import { initializeLoggingHooks } from "@ogcio/fastify-logging-wrapper";
import fastify, { type FastifyServerOptions } from "fastify";
import { envSchema } from "./config.js";
import { getSslConfig } from "./migrations/scripts/shared.js";
import analyticsPlugin from "./plugins/analytics-sdk.js";
import apiAuth from "./plugins/api-auth.js";
import cache from "./plugins/cache.js";
import kyselyPlugin, {
  autoConfig as kyselyAutoConfig,
} from "./plugins/external/kysely.js";
import healthCheck from "./routes/healthcheck.js";
import routes from "./routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function build(opts?: FastifyServerOptions) {
  const app = fastify(opts).withTypeProvider<TypeBoxTypeProvider>();

  initializeErrorHandler(app);
  initializeLoggingHooks(app);

  await app.register(fastifyEnv, {
    schema: envSchema,
    dotenv: true,
  });

  await app.register(analyticsPlugin);

  await app.register(cache);

  await app.register(apiAuth);

  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "OGCIO Scheduler API",
        description: "API for OGCIO Scheduler",
        version: "0.1.0",
      },
    },
  });

  app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    logo: {
      type: "image/png",
      content: Buffer.from(
        fs.readFileSync(join(__dirname, "logo.png")).toString("base64"),
        "base64",
      ),
    },
  });

  app.register(fastifyUnderPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: v8.getHeapStatistics().heap_size_limit,
    maxRssBytes: v8.getHeapStatistics().total_available_size,
    maxEventLoopUtilization: 0.98,
    pressureHandler: (_req, _rep, type, value) => {
      throw httpErrors.serviceUnavailable(
        `System is under pressure. Pressure type: ${type}. Pressure value: ${value}`,
      );
    },
  });

  app.register(postgres, {
    host: app.config.POSTGRES_HOST,
    port: app.config.POSTGRES_PORT,
    user: app.config.POSTGRES_USER,
    password: app.config.POSTGRES_PASSWORD,
    database: app.config.POSTGRES_DB_NAME,
    ssl: getSslConfig(app.config.POSTGRES_SSL),
  });

  // Typed Kysely client (`app.db`), coexisting with `@fastify/postgres`
  // (`app.pg`) during the incremental cutover to the db-core data-access layer.
  await app.register(kyselyPlugin, kyselyAutoConfig(app));

  app.register(healthCheck);

  app.register(routes, { prefix: "/api/v1" });

  app.register(sensible);

  return app;
}
