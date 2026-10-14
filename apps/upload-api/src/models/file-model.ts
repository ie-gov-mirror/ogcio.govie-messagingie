import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";
import type { FileMetadataType } from "../types/schemaDefinitions.js";

/**
 * Data-access model for the `files` domain. Extends the shared {@link BaseModel}
 * for the `files` table and exposes the non-transactional metadata reads that
 * previously lived as raw-pg helpers under `routes/`.
 *
 * The finders reproduce the previous SQL verbatim (identical column list,
 * `deleted`/`scheduled_deletion_at` filters and the filename-clash lookup) via
 * the shared `sql` tag on `app.db`. Every column is aliased to camelCase in SQL,
 * so the shared `CamelCasePlugin` leaves the result keys untouched and no
 * JSON/`::text` workaround is needed.
 *
 * Transactional/connection-reuse list queries (`getUserFiles`,
 * `getOrganizationFiles`, `getSharedFiles`) and all `files` writes (insert,
 * update, deletion scheduling, mark-as-deleted) remain on raw pg and are
 * intentionally not represented here.
 */
export class FileModel extends BaseModel<DB, "files"> {
  constructor(db: Kysely<DB>) {
    super(db, "files");
  }

  /**
   * Fetch active (non-deleted, not scheduled for deletion) file metadata by id.
   * Mirrors the previous `getFileMetadataById` query; returns `undefined` when
   * no matching file exists.
   */
  async findActiveById(id: string): Promise<FileMetadataType | undefined> {
    const result = await sql<FileMetadataType>`
    SELECT 
      id,
      key,
      owner as "ownerId",
      file_size as "fileSize",
      mime_type as "mimeType",
      created_at as "createdAt",
      last_scan as "lastScan",
      infected,
      infection_description as "infectionDescription",
      file_name as "fileName",
      antivirus_db_version as "antivirusDbVersion",
      expires_at as "expiresAt",
      external_id as "externalId"
    FROM 
      files
    WHERE
      id = ${id}
      AND deleted = FALSE
      AND scheduled_deletion_at IS NULL
  `.execute(this.db);

    return result.rows.at(0);
  }

  /**
   * Fetch active file metadata for a set of ids. Mirrors the previous
   * `getFilesMetadataById` query (same projection and filters, `id = ANY(...)`).
   */
  async findActiveByIds(ids: string[]): Promise<FileMetadataType[]> {
    const result = await sql<FileMetadataType>`
    SELECT 
      id,
      key,
      owner as "ownerId",
      file_size as "fileSize",
      mime_type as "mimeType",
      created_at as "createdAt",
      last_scan as "lastScan",
      infected,
      infection_description as "infectionDescription",
      file_name as "fileName",
      antivirus_db_version as "antivirusDbVersion",
      expires_at as "expiresAt",
      external_id as "externalId"
    FROM 
      files
    WHERE
      id = ANY(${ids})
      AND deleted = FALSE
      AND scheduled_deletion_at IS NULL
  `.execute(this.db);

    return result.rows;
  }

  /**
   * Whether a file with the given id belongs to an organisation. Mirrors the
   * organisation-ownership access check in `userCanAccessFileOrThrow`
   * (`SELECT id FROM files WHERE organization_id = $1 and id = $2 LIMIT 1`).
   */
  async isOwnedByOrganization(
    organizationId: string,
    id: string,
  ): Promise<boolean> {
    const result = await sql<{ id: string }>`
    SELECT id FROM files
    WHERE organization_id = ${organizationId} and id = ${id} LIMIT 1
  `.execute(this.db);

    return result.rows.length > 0;
  }

  /**
   * Whether an active file with the given name already exists for an owner.
   * Mirrors the `isFilenameAlreadyPresent` lookup used by `getFilename`.
   */
  async isFilenameInUseForOwner(
    owner: string,
    fileName: string,
  ): Promise<boolean> {
    const result = await sql<{ fileName: string }>`
    SELECT file_name as "fileName"
    FROM files
    WHERE deleted = false AND owner = ${owner} AND file_name = ${fileName}
  `.execute(this.db);

    return result.rows.length > 0;
  }
}
