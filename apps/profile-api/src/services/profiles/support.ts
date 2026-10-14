import type { FastifyBaseLogger } from "fastify";
import type { Pool } from "pg";
import type { PaginationParams } from "~/schemas/pagination.js";
import type {
  SupportSearchBody,
  SupportSearchResponse,
} from "~/schemas/profiles/support.js";
import { profileSupportServiceFromPool } from "~/services/profiles/support/profile-support-service.js";

export async function supportSearch(params: {
  logger: FastifyBaseLogger;
  pool: Pool;
  body: SupportSearchBody;
  pagination: Required<PaginationParams>;
}): Promise<{ data: SupportSearchResponse; total: number }> {
  return profileSupportServiceFromPool(params.pool).search({
    body: params.body,
    pagination: params.pagination,
  });
}
