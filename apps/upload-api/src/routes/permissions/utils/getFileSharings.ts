import type fastifyPostgres from "@fastify/postgres";
import { sharingServiceFromPool } from "../../../services/sharing-service.js";
import type { Sharing } from "../../../types/schemaDefinitions.js";

/**
 * Backward-compatible wrapper delegating to {@link SharingService} for the
 * per-file sharing listing. The `{ rows }` shape is preserved so existing
 * callers keep working unchanged.
 */
export default async (
  pg: fastifyPostgres.PostgresDb,
  fileId: string,
): Promise<{ rows: Sharing[] }> => {
  const rows = await sharingServiceFromPool(pg.pool).findFileSharings(fileId);
  return { rows };
};
