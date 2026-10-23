import type { Pool } from "pg";
import type { ProfileWithDetails } from "~/schemas/profiles/model.js";
import { profileServiceFromPool } from "./profile-service.js";

export const selectProfiles = async (params: {
  pool: Pool;
  organizationId: string;
  profileIds: string[];
  consentSubjects: string[];
  includeFullDetails?: boolean;
}): Promise<Partial<ProfileWithDetails>[]> =>
  profileServiceFromPool(params.pool).select({
    organizationId: params.organizationId,
    profileIds: params.profileIds,
    consentSubjects: params.consentSubjects,
    includeFullDetails: params.includeFullDetails,
  });
