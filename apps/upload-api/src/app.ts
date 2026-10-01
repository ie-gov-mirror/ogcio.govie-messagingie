import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import v8 from "node:v8";
import autoload from "@fastify/autoload";
import fastifyEnv from "@fastify/env";
import fastifyMultipart from "@fastify/multipart";
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
import healthCheck from "./routes/healthcheck.js";
import routes from "./routes/index.js";
import scheduleCleanupTask from "./utils/scheduleCleanupTask.js";
import {
  CONFIG_TYPE,
  SCHEDULER_TOKEN,
  seedConfig,
} from "./utils/storeConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function build(opts?: FastifyServerOptions) {
  const app = fastify(opts).withTypeProvider<TypeBoxTypeProvider>();
  initializeLoggingHooks(app);
  initializeErrorHandler(app);

  await app.register(fastifyEnv, {
    schema: envSchema,
    dotenv: true,
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: app.config.MAX_FILE_SIZE as number,
      files: 1,
    },
  });

  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "OGCIO File Upload API",
        description: "API for OGCIO file upload service",
        version: "0.1.0",
      },
      tags: [
        {
          name: "FileUploadApi",
        },
      ],
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

  const needsSsl =
    app.config.POSTGRES_SSL === "true" || app.config.POSTGRES_SSL === true;
  app.register(postgres, {
    host: app.config.POSTGRES_HOST as string,
    port: Number(app.config.POSTGRES_PORT),
    user: app.config.POSTGRES_USER as string,
    password: app.config.POSTGRES_PASSWORD as string,
    database: app.config.POSTGRES_DB_NAME as string,
    ssl: getSslConfig(needsSsl),
  });

  app.register(import("@fastify/cookie"), {
    hook: "onRequest", // set to false to disable cookie autoparsing or set autoparsing on any of the following hooks: 'onRequest', 'preParsing', 'preHandler', 'preValidation'. default: 'onRequest'
    parseOptions: {}, // options for parsing cookies
  });

  await app.register(autoload, {
    dir: join(__dirname, "plugins"),
    options: { ...opts },
  });
  app.register(import("@fastify/formbody"));

  app.register(healthCheck);

  app.register(routes, { prefix: "/api/v1" });

  app.register(sensible);

  // Rotating this on boot orphans callbacks already queued with the old token.
  await seedConfig(
    app.pg.pool,
    SCHEDULER_TOKEN,
    randomUUID(),
    "token to allow scheduler jobs to access the API",
    CONFIG_TYPE.STRING,
  );

  await scheduleCleanupTask(app);

  return app;
}
