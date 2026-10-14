import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";
import type { Sharing } from "../types/schemaDefinitions.js";

/**
 * Data-access model for the `files_users` (file-sharing) domain. Extends the
 * shared {@link BaseModel} for the `files_users` table and exposes the
 * non-transactional sharing reads previously written as raw-pg helpers.
 *
 * The finders reproduce the previous SQL verbatim (the per-file sharing listing
 * and the per-user / per-linked-user access checks with `LIMIT 1`) via the
 * shared `sql` tag on `app.db`.
 *
 * Sharing writes (`addFileSharing`, `removeFileSharing`,
 * `removeAllFileSharings`) and the connection-reuse multi-file access check
 * (`userCanAccessMultipleFilesOrThrow`) remain on raw pg and are intentionally
 * not represented here.
 */
export class SharingModel extends BaseModel<DB, "filesUsers"> {
  constructor(db: Kysely<DB>) {
    super(db, "filesUsers");
  }

  /**
   * List all sharings for a file. Mirrors the previous `getFileSharings` query
   * (`SELECT file_id as "fileId", user_id as "userId" ... WHERE file_id = $1`).
   */
  async findByFileId(fileId: string): Promise<Sharing[]> {
    const result = await sql<Sharing>`
    SELECT file_id as "fileId", user_id as "userId" FROM files_users
    WHERE file_id = ${fileId}
  `.execute(this.db);

    return result.rows;
  }

  /**
   * Whether a file is shared with a specific user. Mirrors the single-user
   * access check in `userCanAccessFileOrThrow`.
   */
  async isSharedWithUser(fileId: string, userId: string): Promise<boolean> {
    const result = await sql<{ userId: string }>`
    SELECT user_id FROM files_users
    WHERE file_id = ${fileId} and user_id = ${userId} LIMIT 1
  `.execute(this.db);

    return result.rows.length > 0;
  }

  /**
   * Whether a file is shared with any of the given users. Mirrors the
   * linked-profiles access check in `userCanAccessFileOrThrow`.
   */
  async isSharedWithAnyUser(
    fileId: string,
    userIds: string[],
  ): Promise<boolean> {
    const result = await sql<{ userId: string }>`
    SELECT user_id FROM files_users
    WHERE file_id = ${fileId} and user_id = ANY(${userIds}) LIMIT 1
  `.execute(this.db);

    return result.rows.length > 0;
  }
}
