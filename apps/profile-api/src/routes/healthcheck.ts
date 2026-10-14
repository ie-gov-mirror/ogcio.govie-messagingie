import { httpErrors } from "@fastify/sensible";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { getErrorMessage } from "@ogcio/shared-errors";
import type { FastifyInstance } from "fastify";
import {
  HealthCheckReadySchema,
  HealthCheckSchema,
} from "~/schemas/healthcheck.js";
import { getPackageInfo } from "~/utils/get-package-info.js";

const plugin: FastifyPluginAsyncTypebox = async function healthCheck(
  app: FastifyInstance,
) {
  app.get(
    "/health",
    {
      schema: HealthCheckSchema,
    },
    async () => {
      const { name, version } = await getPackageInfo();
      return { [name]: version };
    },
  );

  app.get(
    "/health/ready",
    {
      schema: HealthCheckReadySchema,
    },
    async () => {
      await checkDb(app);
      return { db: true };
    },
  );
};

const checkDb = async (app: FastifyInstance): Promise<void> => {
  const client = await app.pg.connect();
  try {
    const res = await client.query('SELECT 1 as "column"');
    if (res.rowCount !== 1) {
      throw httpErrors.internalServerError(
        `Expected 1 record, got ${res.rowCount}`,
      );
    }
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "status" in e &&
      typeof e.status === "number" &&
      "statusCode" in e &&
      typeof e.statusCode === "number"
    ) {
      throw e;
    }

    throw httpErrors.internalServerError(getErrorMessage(e));
  } finally {
    client.release();
  }
};

export default plugin;
export const autoPrefix = "";
