import type fastifyPostgres from "@fastify/postgres";
import { fileServiceFromPool } from "../../services/file-service.js";
import type { FileMetadataType } from "../../types/schemaDefinitions.js";

/**
 * Backward-compatible wrapper delegating to {@link FileService} for the active
 * file-metadata-by-id read. The `{ rows }` shape is preserved so existing
 * callers keep working unchanged.
 */
export default async (
  pg: fastifyPostgres.PostgresDb,
  fileId: string,
): Promise<{ rows: FileMetadataType[] }> => {
  const file = await fileServiceFromPool(pg.pool).findFileMetadataById(fileId);
  return { rows: file ? [file] : [] };
};
