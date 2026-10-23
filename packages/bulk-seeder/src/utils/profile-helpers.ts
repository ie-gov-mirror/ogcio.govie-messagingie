import type { GeneratedProfileData } from "../data-generation/profile-generator.js";
import type { SeedingMetadata } from "../seeding-metadata.js";

/**
 * Profile-related utility functions
 */

/**
 * Creates a map of email to metadata for quick lookup
 * Matches profileDataList with profilesMetadata by index
 */
export function createEmailToMetadataMap(
  profileDataList: GeneratedProfileData[],
  profilesMetadata: SeedingMetadata[],
  profileIds: Map<string, string>,
): Map<string, SeedingMetadata> {
  const emailToMetadata = new Map<string, SeedingMetadata>();
  for (let i = 0; i < profileDataList.length; i++) {
    const profileData = profileDataList[i];
    if (i < profilesMetadata.length && profileIds.has(profileData.email)) {
      emailToMetadata.set(profileData.email, profilesMetadata[i]);
    }
  }
  return emailToMetadata;
}

/**
 * Creates a map of email to profile data for quick lookup
 * Matches profileDataList with profilesMetadata by index
 */
export function createEmailToProfileDataMap(
  profileDataList: GeneratedProfileData[],
  profilesMetadata: SeedingMetadata[],
  profileIds: Map<string, string>,
): Map<string, GeneratedProfileData> {
  const emailToProfileData = new Map<string, GeneratedProfileData>();
  for (let i = 0; i < profileDataList.length; i++) {
    const profileData = profileDataList[i];
    if (i < profilesMetadata.length && profileIds.has(profileData.email)) {
      emailToProfileData.set(profileData.email, profileData);
    }
  }
  return emailToProfileData;
}
