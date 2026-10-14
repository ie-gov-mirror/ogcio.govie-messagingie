import { httpErrors } from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "~/db/schema.js";
import { ProfileModel } from "~/models/profile-model.js";
import type { PaginationParams } from "~/schemas/pagination.js";
import type { ListProfilesSearchParams } from "~/schemas/profiles/list.js";
import type {
  ProfileWithDetails,
  ProfileWithLinkedProfiles,
} from "~/schemas/profiles/model.js";
import {
  mergeProfileDataWithProfiles,
  parseProfileDetails,
  parseProfileDetailsWithLinkedProfiles,
} from "~/schemas/profiles/shared.js";

interface ListParams {
  organisationId: string | undefined;
  pagination: Required<PaginationParams>;
  searchParams?: Omit<ListProfilesSearchParams, "consentSubjects"> & {
    ppsns?: string[];
  };
  activeOnly?: boolean;
  consentSubjects: string[];
}

interface SelectParams {
  organizationId: string;
  profileIds: string[];
  consentSubjects: string[];
}

interface FindParams {
  organizationId: string;
  query: Record<string, string>;
  consentSubjects: string[];
}

interface GetParams {
  organizationId: string | undefined;
  profileId: string;
  addLinkedProfiles: boolean;
  consentSubjects: string[];
}

/**
 * Business logic for the `profiles` domain. Composes {@link ProfileModel} for
 * data access and keeps the response shaping (detail merging, consent parsing,
 * not-found handling) here, so route handlers stay thin controllers.
 *
 * Behaviour is intentionally identical to the previous free functions
 * (`listProfiles`, `selectProfiles`, `findProfile`, `getProfile`); those remain
 * as thin delegators to this service for backward compatibility.
 */
export class ProfileService {
  private readonly model: ProfileModel;

  constructor(db: Kysely<DB>) {
    this.model = new ProfileModel(db);
  }

  async list(
    params: ListParams,
  ): Promise<{ data: ProfileWithDetails[]; total: number }> {
    const { rows, total } = await this.model.listRows(params);
    if (total === 0) {
      return { data: [], total: 0 };
    }

    const profileDataMap = await this.model.getProfileDataMap(
      rows.map((row) => row.profileDetailsId),
    );

    return {
      data: mergeProfileDataWithProfiles(rows, profileDataMap),
      total,
    };
  }

  async select(params: SelectParams): Promise<Partial<ProfileWithDetails>[]> {
    const rows = await this.model.selectRows(params);
    const profileDataMap = await this.model.getProfileDataMap(
      rows.map((row) => row.profileDetailsId),
    );

    return mergeProfileDataWithProfiles(rows, profileDataMap);
  }

  async find(params: FindParams): Promise<ProfileWithDetails> {
    const row = await this.model.findRow(params);
    if (row) {
      return parseProfileDetails(row);
    }
    throw httpErrors.notFound("Profile not found");
  }

  async get(params: GetParams): Promise<ProfileWithLinkedProfiles> {
    const profile = await this.model.findWithEnhancedConsent({
      organizationId: params.organizationId,
      profileId: params.profileId,
      consentSubjects: params.consentSubjects,
    });

    if (!profile) {
      throw httpErrors.notFound(`Profile ${params.profileId} not found`);
    }

    const linkedProfiles = params.addLinkedProfiles
      ? await this.model.getLinkedProfiles(params.profileId)
      : [];

    return parseProfileDetailsWithLinkedProfiles(profile, linkedProfiles);
  }
}

/**
 * Build a {@link ProfileService} from a raw pg {@link Pool}. Used by the
 * backward-compatible function wrappers (and tests) that still pass a pool;
 * route handlers instead construct the service from `app.db` directly.
 */
export const profileServiceFromPool = (pool: Pool): ProfileService =>
  new ProfileService(createDbFromPool<DB>(pool));
