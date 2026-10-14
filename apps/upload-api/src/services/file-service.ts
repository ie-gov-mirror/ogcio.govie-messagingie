import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "../db/schema.js";
import { FileModel } from "../models/file-model.js";
import type { FileMetadataType } from "../types/schemaDefinitions.js";

/**
 * Business logic for the `files` domain read paths. Composes {@link FileModel}
 * so route helpers stay thin.
 *
 * Only the non-transactional metadata reads route here; the connection-reuse
 * list queries and all `files` writes remain on raw pg.
 */
export class FileService {
  private readonly model: FileModel;

  constructor(db: Kysely<DB>) {
    this.model = new FileModel(db);
  }

  findFileMetadataById(id: string): Promise<FileMetadataType | undefined> {
    return this.model.findActiveById(id);
  }

  findFilesMetadataByIds(ids: string[]): Promise<FileMetadataType[]> {
    return this.model.findActiveByIds(ids);
  }

  isFilenameInUse(owner: string, fileName: string): Promise<boolean> {
    return this.model.isFilenameInUseForOwner(owner, fileName);
  }

  isFileOwnedByOrganization(
    organizationId: string,
    id: string,
  ): Promise<boolean> {
    return this.model.isOwnedByOrganization(organizationId, id);
  }
}

/**
 * Build a {@link FileService} from a raw pg {@link Pool}. Used by the
 * backward-compatible read helpers (and tests) that still receive a
 * `@fastify/postgres` instance and pass its `pool`.
 */
export const fileServiceFromPool = (pool: Pool): FileService =>
  new FileService(createDbFromPool<DB>(pool));
