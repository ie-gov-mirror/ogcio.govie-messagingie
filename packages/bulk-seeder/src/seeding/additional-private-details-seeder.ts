import type { Profile } from "@ogcio/building-blocks-sdk/dist/client/clients/profile/index.js";
import type { SeederConfiguration } from "../configuration.js";
import type { GeneratedProfileData } from "../data-generation/profile-generator.js";
import {
  generateAdditionalPrivateDetailImports,
  generateProfileImportJSON,
} from "../data-generation/profile-generator.js";
import type { SeedingMetadata } from "../seeding-metadata.js";
import { getProfileImportId } from "../utils/sdk-helpers.js";
import { pollForProfileImportCompletion } from "./profile-import-poller.js";

/**
 * Creates additional private details for profiles that need multiple private details
 */
export async function createAdditionalPrivateDetails(
  profileDataList: GeneratedProfileData[],
  profilesMetadata: SeedingMetadata[],
  profileSDK: Profile,
  config: SeederConfiguration,
  resultsTracker?: {
    recordError: (email: string, message: string) => void;
  },
): Promise<void> {
  // Generate list of additional imports needed
  const additionalImports = generateAdditionalPrivateDetailImports(
    profileDataList,
    profilesMetadata,
  );

  if (additionalImports.length === 0) {
    console.log("[Seeder] No additional private details needed");
    return;
  }

  console.log(
    `[Seeder] Creating ${additionalImports.length} additional private detail records`,
  );

  // Group by email to process in batches
  const importsByEmail = new Map<
    string,
    Array<{ profile: GeneratedProfileData; detailIndex: number }>
  >();

  for (const importData of additionalImports) {
    const email = importData.profile.email;
    let emailArray = importsByEmail.get(email);
    if (!emailArray) {
      importsByEmail.set(email, []);
      emailArray = [];
    }
    emailArray.push(importData);
  }

  // Process in batches to avoid overwhelming the system
  const batchSize = config.batchSize;
  const allEmails = Array.from(importsByEmail.keys());

  for (let i = 0; i < allEmails.length; i += batchSize) {
    const emailBatch = allEmails.slice(i, i + batchSize);
    const batchImports: GeneratedProfileData[] = [];

    // Collect all profiles for this batch
    for (const email of emailBatch) {
      const imports = importsByEmail.get(email);
      if (!imports) continue;
      // For each email, we can import all additional details at once
      // The system will create a new detail for each import
      batchImports.push(...imports.map((imp) => imp.profile));
    }

    if (batchImports.length > 0) {
      try {
        const importData = generateProfileImportJSON(batchImports);
        const result = await profileSDK.importProfiles(
          { records: importData.profiles },
          true,
          true,
          "full",
        );
        const importId = getProfileImportId(result);
        if (importId) {
          await pollForProfileImportCompletion(importId, config, profileSDK);
        }
        console.log(
          `[Seeder] Completed additional private details import batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allEmails.length / batchSize)}`,
        );
      } catch (error) {
        console.error(
          `[Seeder] Error creating additional private details for batch ${i}-${i + batchSize}: ${(error as Error).message}`,
        );

        // Record errors
        for (const profile of batchImports) {
          resultsTracker?.recordError(
            profile.email,
            `Failed to create additional private detail for ${profile.email}: ${(error as Error).message}`,
          );
        }
      }
    }
  }
}
