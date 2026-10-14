import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "~/db/schema.js";
import { ProfileSupportModel } from "~/models/profile-support-model.js";
import type { PaginationParams } from "~/schemas/pagination.js";
import type {
  SupportSearchBody,
  SupportSearchResponse,
} from "~/schemas/profiles/support.js";

/**
 * Business logic for the support profile search. Composes
 * {@link ProfileSupportModel} for data access and keeps the response shaping
 * (merging the `profile_data` string fields into each row) here so the route
 * handler stays a thin controller.
 *
 * Behaviour is intentionally identical to the previous `supportSearch` free
 * function, which remains as a thin delegator for backward compatibility.
 */
export class ProfileSupportService {
  private readonly model: ProfileSupportModel;

  constructor(db: Kysely<DB>) {
    this.model = new ProfileSupportModel(db);
  }

  async search(params: {
    body: SupportSearchBody;
    pagination: Required<PaginationParams>;
  }): Promise<{ data: SupportSearchResponse; total: number }> {
    const { rows, total } = await this.model.search(params);

    if (rows.length === 0) {
      return { data: [], total };
    }

    const profileDetailsIds = rows.map((row) => row.profileDetailsId);
    const profileData =
      await this.model.getProfileDataForDetails(profileDetailsIds);

    const dataMap: Record<
      string,
      {
        email?: string;
        ppsn?: string;
        dateOfBirth?: string;
        firstName?: string;
        lastName?: string;
      }
    > = {};
    for (const row of profileData) {
      if (!dataMap[row.profileDetailsId]) {
        dataMap[row.profileDetailsId] = {};
      }
      dataMap[row.profileDetailsId][
        row.name as "email" | "ppsn" | "dateOfBirth" | "firstName" | "lastName"
      ] = row.value;
    }

    const data: SupportSearchResponse = rows.map((row) => ({
      id: row.id,
      publicName: row.publicName,
      email: dataMap[row.profileDetailsId]?.email ?? "",
      organisationId: row.organisationId,
      ppsn: dataMap[row.profileDetailsId]?.ppsn ?? null,
      dateOfBirth: dataMap[row.profileDetailsId]?.dateOfBirth ?? null,
      firstName: dataMap[row.profileDetailsId]?.firstName ?? null,
      lastName: dataMap[row.profileDetailsId]?.lastName ?? null,
      primaryUserId: row.primaryUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      consentStatuses: row.consentStatuses ?? {},
      preferredLanguage: row.preferredLanguage,
      status: row.status,
      safeLevel: row.safeLevel ? Number(row.safeLevel) : 0,
    }));

    return { data, total };
  }
}

/**
 * Build a {@link ProfileSupportService} from a raw pg {@link Pool}. Used by the
 * backward-compatible `supportSearch` wrapper (and tests) that still pass a
 * pool; the route handler constructs the service from `app.db` directly.
 */
export const profileSupportServiceFromPool = (
  pool: Pool,
): ProfileSupportService =>
  new ProfileSupportService(createDbFromPool<DB>(pool));
