import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getLoggingConfiguration } from "@ogcio/fastify-logging-wrapper";
import type { FastifyInstance } from "fastify";
import type { PinoLoggerOptions } from "fastify/types/logger.js";
import { build } from "./app.js";
import { worker } from "./worker.js";

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

const app = await build(
  getLoggingConfiguration({
    additionalLoggerConfigs: {
      level: (process.env.LOG_LEVEL ?? "debug") as PinoLoggerOptions["level"],
    },
  }),
);

const scheduler = await worker(app, randomUUID().toString());

app.listen({ host: "0.0.0.0", port: 8005 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`app listening at ${address}`);
});

scheduler.start();

await app.ready();
await writeOpenApiDefinition(app);
