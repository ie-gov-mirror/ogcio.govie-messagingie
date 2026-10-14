import type fastifyPostgres from "@fastify/postgres";
import { fileServiceFromPool } from "../../services/file-service.js";
import type { FileMetadataType } from "../../types/schemaDefinitions.js";

/**
 * Backward-compatible wrapper delegating to {@link FileService} for the active
 * file-metadata-by-ids read. The `{ rows }` shape is preserved so existing
 * callers keep working unchanged.
 */
export default async (
  pg: fastifyPostgres.PostgresDb,
  fileIds: string[],
): Promise<{ rows: FileMetadataType[] }> => {
  const rows = await fileServiceFromPool(pg.pool).findFilesMetadataByIds(
    fileIds,
  );
  return { rows };
};
