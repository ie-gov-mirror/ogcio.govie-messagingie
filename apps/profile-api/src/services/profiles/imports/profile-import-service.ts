import { httpErrors } from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "~/db/schema.js";
import {
  type ListImportsParams,
  ProfileImportModel,
  type ProfileImportRow,
} from "~/models/profile-import-model.js";
import type {
  KnownProfileDataDetails,
  ProfileImportDetail,
} from "~/schemas/profiles/model.js";
import type { SavedFileInfo } from "~/utils/save-request-file.js";

const isValidProfileData = (data: unknown): data is KnownProfileDataDetails => {
  if (typeof data !== "object" || data === null) return false;
  const profile = data as Record<string, unknown>;
  return (
    typeof profile.firstName === "string" &&
    typeof profile.lastName === "string" &&
    typeof profile.email === "string"
  );
};

/**
 * Business logic for the `profile_imports` domain. Composes
 * {@link ProfileImportModel} for data access and keeps the not-found/validation
 * handling here, so route handlers stay thin controllers.
 *
 * Behaviour is intentionally identical to the previous free functions
 * (`listProfileImports`, `getProfileImport`, `getProfileImportDetails`); those
 * remain as thin delegators for backward compatibility.
 */
export class ProfileImportService {
  private readonly model: ProfileImportModel;

  constructor(db: Kysely<DB>) {
    this.model = new ProfileImportModel(db);
  }

  async list(
    params: ListImportsParams,
  ): Promise<{ data: ProfileImportRow[]; total: number }> {
    return this.model.listImports(params);
  }

  async get(profileImportId: string): Promise<{
    organisationId: string;
    metadata: SavedFileInfo["metadata"];
    status: string;
    createdAt: string;
  }> {
    const row = await this.model.getImport(profileImportId);

    if (!row?.metadata) {
      throw httpErrors.notFound(
        `Status for profile_import with id ${profileImportId} not found`,
      );
    }

    return {
      organisationId: row.organisationId as string,
      metadata: row.metadata,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  async getDetails(
    importId: string,
    batch?: number,
  ): Promise<ProfileImportDetail[]> {
    if (!importId) {
      throw httpErrors.badRequest("Profile import ID is required");
    }

    const rows = await this.model.listImportDetails(importId, batch);

    if (rows.length === 0) {
      throw httpErrors.notFound(
        `No import details found for import ID: ${importId}`,
      );
    }

    return rows.map((row) => {
      if (!isValidProfileData(row.data)) {
        throw httpErrors.badRequest("Invalid profile data format");
      }

      return { id: row.id, ...row.data, status: row.status, batch: row.batch };
    });
  }
}

/**
 * Build a {@link ProfileImportService} from a raw pg {@link Pool}. Used by the
 * backward-compatible function wrappers (and tests) that still pass a pool;
 * route handlers instead construct the service from `app.db` directly.
 */
export const profileImportServiceFromPool = (
  pool: Pool,
): ProfileImportService => new ProfileImportService(createDbFromPool<DB>(pool));
