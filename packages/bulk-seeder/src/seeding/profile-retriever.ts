import type { Profile } from "@ogcio/building-blocks-sdk/dist/types/index.js";
import type { SeederConfiguration } from "../configuration.js";
import type { GeneratedProfileData } from "../data-generation/profile-generator.js";
import { SDKError } from "../errors/seeding-errors.js";
/**
 * Retrieves profile IDs by PPSNs using batched SDK searches
 */
export async function retrieveProfilesByPPSNs(
  profileDataList: GeneratedProfileData[],
  profileSDK: Profile,
  config: SeederConfiguration,
  resultsTracker?: {
    recordProfileRetrieved: (email: string, profileId: string) => void;
    recordError: (email: string, message: string) => void;
  },
): Promise<Map<string, string>> {
  // Map: email -> profileId
  const profileIds = new Map<string, string>();
  const ppsns = profileDataList.map((p) => p.ppsn);

  // Process PPSNs in batches
  const batchSize = config.ppsnSearchBatchSize;

  for (let i = 0; i < ppsns.length; i += batchSize) {
    const batchPpsns = ppsns.slice(i, i + batchSize);

    try {
      const result = await profileSDK.listProfilesPost({
        query: { limit: batchSize.toString() },
        body: { ppsns: batchPpsns },
      });

      // Map results back to emails
      if (result.data && Array.isArray(result.data)) {
        for (const profile of result.data) {
          if (profile.email && profile.id) {
            profileIds.set(profile.email, profile.id);
            resultsTracker?.recordProfileRetrieved(profile.email, profile.id);
          }
        }
      }

      console.log(
        `[Seeder] Retrieved ${profileIds.size} profiles from batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(ppsns.length / batchSize)}`,
      );
    } catch (error) {
      const errorMessage = `Error retrieving profiles for PPSN batch ${i}-${i + batchSize}: ${(error as Error).message}`;
      console.error(`[Seeder] ${errorMessage}`);
      throw new SDKError(errorMessage, "profile", {
        batchStart: i,
        batchEnd: i + batchSize,
        originalError: error,
      });
    }
  }

  // Check for missing profiles
  const missingProfiles: string[] = [];
  for (const profileData of profileDataList) {
    if (!profileIds.has(profileData.email)) {
      missingProfiles.push(profileData.email);
      resultsTracker?.recordError(
        profileData.email,
        `Profile not found after import for email: ${profileData.email}`,
      );
    }
  }

  if (missingProfiles.length > 0) {
    console.warn(
      `[Seeder] Warning: ${missingProfiles.length} profiles were not found after import`,
    );
  }

  return profileIds;
}
