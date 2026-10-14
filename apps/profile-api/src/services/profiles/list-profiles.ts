import type { Pool } from "pg";
import type { PaginationParams } from "~/schemas/pagination.js";
import type { ListProfilesSearchParams } from "~/schemas/profiles/list.js";
import type { ProfileWithDetails } from "~/schemas/profiles/model.js";
import { profileServiceFromPool } from "./profile-service.js";

export const listProfiles = async (params: {
  pool: Pool;
  organisationId: string | undefined;
  pagination: Required<PaginationParams>;
  searchParams?: Omit<ListProfilesSearchParams, "consentSubjects"> & {
    ppsns?: string[];
  };
  activeOnly?: boolean;
  consentSubjects: string[];
}): Promise<{ data: ProfileWithDetails[]; total: number }> =>
  profileServiceFromPool(params.pool).list({
    organisationId: params.organisationId,
    pagination: params.pagination,
    searchParams: params.searchParams,
    activeOnly: params.activeOnly,
    consentSubjects: params.consentSubjects,
  });
