import { httpErrors } from "@fastify/sensible";
import type { Pool, PoolClient } from "pg";
import type {
  LinkedProfile,
  ProfileWithLinkedProfiles,
} from "~/schemas/profiles/model.js";
import { parseProfileDetailsWithLinkedProfiles } from "~/schemas/profiles/shared.js";
import { profileServiceFromPool } from "./profile-service.js";
import {
  findProfileWithEnhancedConsent,
  type ProfileWithEnhancedConsent,
} from "./sql/find-profile-with-enhanced-consent.js";
import { getLinkedProfiles } from "./sql/get-linked-profiles.js";

export const getProfile = async (
  params: {
    organizationId: string | undefined;
    profileId: string;
    addLinkedProfiles: boolean;
    consentSubjects: string[];
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<ProfileWithLinkedProfiles> => {
  // The transactional `{ client }` variant is used inside existing pg
  // transactions (consents, account-linking, deletion). It must keep running
  // on the caller's connection, so it stays on the raw pg path.
  if ("client" in params) {
    const profileData = await executeGetProfile(params);

    if (!profileData.profile) {
      throw httpErrors.notFound(`Profile ${params.profileId} not found`);
    }

    return parseProfileDetailsWithLinkedProfiles(
      profileData.profile,
      profileData.linkedProfiles,
    );
  }

  // The pool path delegates to the Kysely-backed service.
  return profileServiceFromPool(params.pool).get({
    organizationId: params.organizationId,
    profileId: params.profileId,
    addLinkedProfiles: params.addLinkedProfiles,
    consentSubjects: params.consentSubjects,
  });
};

async function executeGetProfile(params: {
  client: PoolClient;
  organizationId: string | undefined;
  profileId: string;
  addLinkedProfiles: boolean;
  consentSubjects: string[];
}): Promise<
  | {
      profile: undefined;
      linkedProfiles: undefined;
    }
  | {
      profile: ProfileWithEnhancedConsent;
      linkedProfiles: LinkedProfile[];
    }
> {
  const output = await findProfileWithEnhancedConsent(
    params.client,
    params.organizationId,
    params.profileId,
    params.consentSubjects,
  );

  if (!output) {
    return { profile: undefined, linkedProfiles: undefined };
  }
  let linkedProfiles: LinkedProfile[] = [];
  if (params.addLinkedProfiles) {
    linkedProfiles = await getLinkedProfiles({
      client: params.client,
      primaryUserId: params.profileId,
    });
  }

  return {
    profile: output,
    linkedProfiles,
  };
}
