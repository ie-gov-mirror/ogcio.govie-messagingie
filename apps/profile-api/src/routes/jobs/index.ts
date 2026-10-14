import { httpErrors } from "@fastify/sensible";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { ExecuteJobReqSchema } from "~/schemas/jobs.js";
import type { FastifyRequestTypebox } from "~/schemas/shared.js";
import { JobService } from "~/services/jobs/job-service.js";
import { executeImportProfiles } from "~/services/profiles/imports/import-profiles.js";
import { parseBooleanEnum } from "~/types/typebox.js";

const plugin: FastifyPluginAsyncTypebox = async (fastify: FastifyInstance) => {
  fastify.post(
    "/import-profiles/:profileImportId",
    {
      schema: ExecuteJobReqSchema,
    },
    async (request: FastifyRequestTypebox<typeof ExecuteJobReqSchema>) => {
      const { profileImportId } = request.params;
      const { token } = request.body;

      // Verify token
      const isTokenVerified = await new JobService(fastify.db).verifyToken({
        profileImportId,
        token,
      });
      if (!isTokenVerified) {
        throw httpErrors.unauthorized("Invalid token");
      }

      const insertPrivateDetails = parseBooleanEnum(
        request.query.insertPrivateDetails ?? "false",
      );
      const batchIndex = request.query.batchIndex
        ? Number.parseInt(request.query.batchIndex, 10)
        : 0;
      const totalBatches = request.query.totalBatches
        ? Number.parseInt(request.query.totalBatches, 10)
        : 1;

      const onlyPrivateDetails =
        parseBooleanEnum(request.query.onlyPrivateDetails ?? "false") &&
        insertPrivateDetails;
      // Execute job without waiting for it to finish
      executeImportProfiles({
        pool: fastify.pg.pool,
        logger: request.log,
        profileImportId,
        config: fastify.config,
        insertPrivateDetails,
        onlyPrivateDetails,
        batchIndex,
        totalBatches,
      });

      return {
        status: "success",
      };
    },
  );
};

export default plugin;
export const autoPrefix = "/api/v1/jobs";
