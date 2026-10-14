import type { Pool } from "pg";
import type { ProfileWithDetails } from "~/schemas/profiles/model.js";
import { profileServiceFromPool } from "./profile-service.js";

export const findProfile = async (params: {
  pool: Pool;
  organizationId: string;
  query: Record<string, string>;
  consentSubjects: string[];
}): Promise<ProfileWithDetails> =>
  profileServiceFromPool(params.pool).find({
    organizationId: params.organizationId,
    query: params.query,
    consentSubjects: params.consentSubjects,
  });
