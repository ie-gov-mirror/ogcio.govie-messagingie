import type { FastifyBaseLogger } from "fastify";
import type { Pool } from "pg";
import { jobServiceFromPool } from "./job-service.js";

export const verifyToken = async (params: {
  pool: Pool;
  logger: FastifyBaseLogger;
  profileImportId: string;
  token: string;
}): Promise<boolean> =>
  jobServiceFromPool(params.pool).verifyToken({
    profileImportId: params.profileImportId,
    token: params.token,
  });
