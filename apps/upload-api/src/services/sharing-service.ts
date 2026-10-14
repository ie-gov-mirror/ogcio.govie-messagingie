import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "../db/schema.js";
import { SharingModel } from "../models/sharing-model.js";
import type { Sharing } from "../types/schemaDefinitions.js";

/**
 * Business logic for the `files_users` (file-sharing) domain read paths.
 * Composes {@link SharingModel} so route helpers stay thin.
 */
export class SharingService {
  private readonly model: SharingModel;

  constructor(db: Kysely<DB>) {
    this.model = new SharingModel(db);
  }

  findFileSharings(fileId: string): Promise<Sharing[]> {
    return this.model.findByFileId(fileId);
  }

  isSharedWithUser(fileId: string, userId: string): Promise<boolean> {
    return this.model.isSharedWithUser(fileId, userId);
  }

  isSharedWithAnyUser(fileId: string, userIds: string[]): Promise<boolean> {
    return this.model.isSharedWithAnyUser(fileId, userIds);
  }
}

/**
 * Build a {@link SharingService} from a raw pg {@link Pool}. Used by the
 * backward-compatible read helpers (and tests) that still receive a
 * `@fastify/postgres` instance and pass its `pool`.
 */
export const sharingServiceFromPool = (pool: Pool): SharingService =>
  new SharingService(createDbFromPool<DB>(pool));
