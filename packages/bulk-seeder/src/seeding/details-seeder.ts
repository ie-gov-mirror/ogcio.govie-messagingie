import type { SeederConfiguration } from "../configuration.js";
import type { GeneratedProfileData } from "../data-generation/profile-generator.js";
import type { SeedingMetadata } from "../seeding-metadata.js";
import { logProgress } from "../utils/logging-helpers.js";
import { createEmailToMetadataMap } from "../utils/profile-helpers.js";
import type { SeedingResultsTracker } from "./seeding-results-tracker.js";

/**
 * Seeds profile details using SDK
 * Note: Private details and organization details are already created via import.
 * This function records the creation of details in the results tracker.
 */
export async function seedDetails(
  profileIds: Map<string, string>, // email -> profileId
  profilesMetadata: SeedingMetadata[],
  profileDataList: GeneratedProfileData[],
  config: SeederConfiguration,
  resultsTracker?: SeedingResultsTracker,
): Promise<void> {
  console.log("[Seeder] Seeding details...");

  if (profileIds.size === 0) {
    console.log("[Seeder] No profiles to seed details for");
    return;
  }

  // Create a map of email to metadata for quick lookup
  const emailToMetadata = createEmailToMetadataMap(
    profileDataList,
    profilesMetadata,
    profileIds,
  );

  // Process details in batches
  const batchSize = config.batchSize || 25;
  const emailArray = Array.from(profileIds.entries());
  let processedCount = 0;
  let privateDetailsCount = 0;
  let orgDetailsCount = 0;

  for (let i = 0; i < emailArray.length; i += batchSize) {
    const batch = emailArray.slice(i, i + batchSize);

    // Process batch
    for (const [email, profileId] of batch) {
      const metadata = emailToMetadata.get(email);
      if (!metadata) {
        console.warn(`[Seeder] No metadata found for email: ${email}`);
        continue;
      }

      // Record private details creation
      // Each profile has at least 1 private detail (created via import)
      // Additional private details are created via createAdditionalPrivateDetails
      if (metadata.privateDetailsCount > 0 && resultsTracker) {
        // Record the initial private detail
        resultsTracker.recordPrivateDetailCreated(email, profileId);
        privateDetailsCount++;
      }

      // Record organization details creation
      // Organization details are created during import if hasOrgDetails is true
      if (metadata.hasOrgDetails && resultsTracker) {
        resultsTracker.recordOrgDetailCreated(email, profileId);
        orgDetailsCount++;
      }
    }

    processedCount += batch.length;
    logProgress(processedCount, emailArray.length, "details");
  }

  console.log(
    `[Seeder] Details seeding completed: ${privateDetailsCount} private details, ${orgDetailsCount} organization details recorded`,
  );
}
