import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { getLoggingConfiguration } from "@ogcio/fastify-logging-wrapper";
import { type FastifyInstance, fastify } from "fastify";
import type { PinoLoggerOptions } from "fastify/types/logger.js";
import fp from "fastify-plugin";
import buildServer from "./app.js";

const execFileAsync = promisify(execFile);
const formatOpenApiScript = fileURLToPath(
  new URL("../../../scripts/format-openapi-file.mjs", import.meta.url),
);

const writeOpenApiDefinition = async (app: FastifyInstance) => {
  const file = "./openapi-definition.yml";
  try {
    await writeFile(file, app.swagger({ yaml: true }));
    // Production images do not include the formatter; leave the raw file.
    if (existsSync(formatOpenApiScript)) {
      await execFileAsync(process.execPath, [formatOpenApiScript, file]);
    }
  } catch (e) {
    app.log.warn(e, "Error writing open api definition file");
  }
};

const server = fastify({
  ...getLoggingConfiguration({
    additionalLoggerConfigs: {
      level: (process.env.LOG_LEVEL ?? "debug") as PinoLoggerOptions["level"],
    },
  }),
  ajv: {
    customOptions: {
      coerceTypes: false,
      removeAdditional: "all",
    },
  },
}).withTypeProvider<TypeBoxTypeProvider>();

server.register(fp(buildServer));
await server.ready();

server.listen({ host: "0.0.0.0", port: 8002 }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
});

await writeOpenApiDefinition(server);
