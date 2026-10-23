import type { FastifyBaseLogger } from "fastify";
import { buildLogtoClient } from "~/clients/logto.js";
import {
  BB_CITIZEN_ROLE_ID,
  ONBOARDING_CANDIDATE_ROLE_ID,
} from "~/const/logto.js";
import type { EnvConfig } from "~/plugins/external/env.js";
import type { KnownProfileDataDetails } from "~/schemas/profiles/model.js";

interface LogtoUserResult {
  id: string;
  primaryEmail: string;
}

export interface LogtoError extends Error {
  successfulEmails: string[];
}

const BATCH_SIZE = 10;
const chunks = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );

export const createLogtoUsers = async (
  profiles: Pick<KnownProfileDataDetails, "email" | "firstName" | "lastName">[],
  config: EnvConfig,
  organizationId: string,
  profileImportId: string,
  insertPrivateDetails: boolean,
  onlyPrivateDetails: boolean,
  logger: FastifyBaseLogger,
): Promise<LogtoUserResult[]> => {
  const client = await buildLogtoClient(config);

  const results = [];
  const errors = [];
  for (const batch of chunks(profiles, BATCH_SIZE)) {
    const batchPromises = batch.map(async (profile) => {
      try {
        const result = await client.createUser({
          primaryEmail: profile.email,
          name: [profile.firstName, profile.lastName]
            .join(" ")
            .substring(0, 128),
          customData: {
            organizationId,
            profileImportId,
            insertPrivateDetails,
            onlyPrivateDetails,
          },
        });
        // Management API creates skip the sign-up hook that assigns these.
        await client.assignUserRole(result.id, BB_CITIZEN_ROLE_ID);
        await client.assignUserRole(result.id, ONBOARDING_CANDIDATE_ROLE_ID);
        return { success: true, result };
      } catch (error) {
        logger.error({
          message: "Error creating Logto user",
          error,
          email: profile.email,
        });
        return { success: false, error, email: profile.email };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(
      ...batchResults
        .filter((r) => r.success)
        .map((r) => r.result as LogtoUserResult),
    );
    errors.push(...batchResults.filter((r) => !r.success));

    // Add a small delay between batches to avoid rate limiting
    if (batch.length === BATCH_SIZE) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (errors.length > 0) {
    const error = new Error(
      `${profileImportId} [Logto] | ${errors.length} users failed to be created: ${errors.map((e) => e.error).join(", ")}`,
    ) as LogtoError;
    error.successfulEmails = results.map((r) => r.primaryEmail);
    logger.error({
      message: "Error creating Logto users",
      error,
    });
    throw error;
  }

  return results;
};
