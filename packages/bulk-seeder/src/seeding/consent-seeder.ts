import type { Profile } from "@ogcio/building-blocks-sdk/dist/client/clients/profile/index.js";
import type { SeederConfiguration } from "../configuration.js";
import type { GeneratedProfileData } from "../data-generation/profile-generator.js";
import { getProfileSdkForCitizen } from "../sdk/sdk-factory.js";
import type { SeedingMetadata } from "../seeding-metadata.js";
import { extractSDKErrorDetail } from "../utils/error-helpers.js";
import { logCompletionSummary, logProgress } from "../utils/logging-helpers.js";
import { createEmailToMetadataMap } from "../utils/profile-helpers.js";
import type { SeedingResultsTracker } from "./seeding-results-tracker.js";

/**
 * Gets the latest consent statement ID for a given subject using SDK
 * @param profileSDK - Profile SDK instance
 * @param subject - Consent subject (e.g., "messaging")
 * @returns Consent statement ID
 */
async function getLatestConsentStatementId(
  profileSDK: Profile,
  subject: string,
): Promise<string> {
  try {
    const response = await profileSDK.organisation.getCurrentConsentStatement({
      subject,
    });

    if (response.error) {
      const errorObj = response.error as Record<string, unknown>;
      const errorDetail = extractSDKErrorDetail(errorObj);
      throw new Error(`Failed to get consent statement: ${errorDetail}`);
    }

    if (!response.data || response.data.length === 0) {
      throw new Error(
        `No active consent statement found for subject: ${subject}`,
      );
    }

    // The response is an array, get the first (latest) one
    const statement = response.data[0];
    if (!statement?.id) {
      throw new Error(`Consent statement for subject ${subject} has no ID`);
    }

    return statement.id;
  } catch (error) {
    console.error(
      `[Seeder] Error getting consent statement ID for subject ${subject}:`,
      (error as Error).message,
    );
    throw error;
  }
}

/**
 * Seeds consents for profiles using SDK
 */
export async function seedConsents(
  profileIds: Map<string, string>, // email -> profileId
  profilesMetadata: SeedingMetadata[],
  profileDataList: GeneratedProfileData[],
  profileSDK: Profile,
  config: SeederConfiguration,
  resultsTracker?: SeedingResultsTracker,
): Promise<void> {
  console.log("[Seeder] Seeding consents...");

  if (profileIds.size === 0) {
    console.log("[Seeder] No profiles to seed consents for");
    return;
  }

  // Get the latest consent statement ID for messaging subject
  const consentStatementId = await getLatestConsentStatementId(
    profileSDK,
    "messaging",
  );

  console.log(
    `[Seeder] Using consent statement ID: ${consentStatementId} for messaging consents`,
  );

  // Create a map of email to metadata for quick lookup
  const emailToMetadata = createEmailToMetadataMap(
    profileDataList,
    profilesMetadata,
    profileIds,
  );

  // Process consents in batches
  const batchSize = config.batchSize || 25;
  const emailArray = Array.from(profileIds.entries());
  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < emailArray.length; i += batchSize) {
    const batch = emailArray.slice(i, i + batchSize);

    // Process batch in parallel
    const batchPromises = batch.map(async ([email, profileId]) => {
      const metadata = emailToMetadata.get(email);
      if (!metadata) {
        console.warn(`[Seeder] No metadata found for email: ${email}`);
        return;
      }

      // Skip if no consents to create for this profile
      if (metadata.consentsCount === 0) {
        return;
      }

      // Determine consent status based on validConsentsCount
      // If validConsentsCount > 0, use "opted-in", otherwise "opted-out"
      const consentStatus: "opted-in" | "opted-out" =
        metadata.validConsentsCount > 0 ? "opted-in" : "opted-out";

      try {
        // Get citizen SDK for this user (uses personal access token for impersonation)
        const citizenSDK = await getProfileSdkForCitizen(config, profileId);

        // Submit consent using SDK citizen.submitConsent method
        const response = await citizenSDK.citizen.submitConsent({
          consents: [
            {
              subject: "messaging",
              status: consentStatus,
              consentStatementId: consentStatementId,
            },
          ],
        });

        if (response.error) {
          const errorObj = response.error as Record<string, unknown>;
          const errorDetail = extractSDKErrorDetail(errorObj);
          throw new Error(`SDK error: ${errorDetail}`);
        }

        // Record success
        if (resultsTracker) {
          resultsTracker.recordConsentCreated(email, profileId);
        }
        successCount++;
      } catch (error) {
        const errorMessage = `Failed to create consent: ${(error as Error).message}`;
        console.error(
          `[Seeder] Error seeding consent for ${email}:`,
          errorMessage,
        );
        if (resultsTracker) {
          resultsTracker.recordError(email, errorMessage);
        }
        errorCount++;
      }
    });

    await Promise.all(batchPromises);
    processedCount += batch.length;
    logProgress(processedCount, emailArray.length, "consents");
  }

  logCompletionSummary("Consents seeding", successCount, errorCount);
}
