import { createHash } from "node:crypto";
import { faker } from "@faker-js/faker";
import type { SeederConfiguration } from "../configuration.js";
import type { SeedingMetadata } from "../seeding-metadata.js";

/**
 * Profile import user data structure
 */
export type ProfileImportUser = {
  email: string;
  phone: string;
  dateOfBirth: string;
  ppsn: string;
  externalId: string;
  firstName: string;
  lastName: string;
};

/**
 * Profile import data structure
 */
export type ProfileImportData = {
  profiles: ProfileImportUser[];
};

/**
 * Generated profile data with all required fields for import
 */
export type GeneratedProfileData = {
  email: string;
  phone: string;
  dateOfBirth: string;
  ppsn: string;
  externalId: string;
  firstName: string;
  lastName: string;
  myGovId: string; // Hash of PPSN
};

/**
 * Generates a MyGovId from email using SHA256 hash
 */
export function generateMyGovIdFromEmail(email: string): string {
  const hash = createHash("sha256");
  hash.update(email);
  return hash.digest("hex");
}

/**
 * Generates a consistent external ID for a profile
 */
export function generateExternalId(
  index: number,
  config: SeederConfiguration,
  uniqueBatchId: number,
): string {
  return `${config.externalIdPrefix}${index.toString().padStart(8, "0")}-${uniqueBatchId}`;
}

/**
 * Generates a random PPSN in the correct format
 * Format: 7 digits + 1 or 2 uppercase letters (A–Z)
 */
function randomPPSN(): string {
  const digits = Math.floor(1000000 + Math.random() * 9000000).toString();
  const letters = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const maybeSecondLetter =
    Math.random() < 0.3
      ? String.fromCharCode(65 + Math.floor(Math.random() * 26))
      : "";
  const ppsn = `${digits}${letters}${maybeSecondLetter}`;
  return ppsn.slice(0, 9); // hard cap to 9 chars, safe under varchar(12)
}

/**
 * Generates profile data for a single profile
 */
function generateProfileData(
  index: number,
  config: SeederConfiguration,
  uniqueBatchId: number,
): GeneratedProfileData {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const ppsn = randomPPSN();
  const email = `${config.loadTestingEmailPrefix}${index}@${config.loadTestingEmailDomain}`;
  const myGovId = generateMyGovIdFromEmail(email);
  const phoneNumber = `+3534${index.toString().padStart(8, "0")}`;
  const dateOfBirth = faker.date
    .birthdate({ min: 1940, max: 2000, mode: "year" })
    .toISOString()
    .split("T")[0];
  const externalId = generateExternalId(index, config, uniqueBatchId);

  return {
    email,
    phone: phoneNumber,
    dateOfBirth,
    ppsn,
    externalId,
    firstName,
    lastName,
    myGovId,
  };
}

/**
 * Generates all profile data upfront with PPSNs and myGovId
 */
export function generateAllProfileData(
  profilesMetadata: SeedingMetadata[],
  config: SeederConfiguration,
): GeneratedProfileData[] {
  const profileDataList: GeneratedProfileData[] = [];
  const uniqueBatchId = Date.now();
  for (let i = 0; i < profilesMetadata.length; i++) {
    const profileData = generateProfileData(i + 1, config, uniqueBatchId);
    profileDataList.push(profileData);
  }

  return profileDataList;
}

/**
 * Splits profiles into two groups: private-only and with-organization details
 */
export function splitProfilesByOrgDetails(
  profileDataList: GeneratedProfileData[],
  profilesMetadata: SeedingMetadata[],
): {
  privateOnlyProfiles: GeneratedProfileData[];
  withOrgProfiles: GeneratedProfileData[];
} {
  const privateOnlyProfiles: GeneratedProfileData[] = [];
  const withOrgProfiles: GeneratedProfileData[] = [];

  for (let i = 0; i < profileDataList.length; i++) {
    const profile = profileDataList[i];
    const metadata = profilesMetadata[i];

    if (metadata.hasOrgDetails) {
      withOrgProfiles.push(profile);
    } else {
      privateOnlyProfiles.push(profile);
    }
  }

  return {
    privateOnlyProfiles,
    withOrgProfiles,
  };
}

/**
 * Generates updated profile data for additional private detail imports
 * Modifies lastName slightly to trigger new detail creation
 */
export function generateUpdatedProfileData(
  originalProfile: GeneratedProfileData,
  detailIndex: number,
): GeneratedProfileData {
  // Modify lastName slightly to trigger new detail creation
  // Keep email the same as it's the key for matching
  const lastNameModifier = detailIndex > 0 ? ` (v${detailIndex + 1})` : "";

  return {
    ...originalProfile,
    lastName: `${originalProfile.lastName}${lastNameModifier}`,
    // Keep all other fields the same except lastName
  };
}

/**
 * Generates list of additional private detail imports needed
 */
export function generateAdditionalPrivateDetailImports(
  profileDataList: GeneratedProfileData[],
  profilesMetadata: SeedingMetadata[],
): Array<{ profile: GeneratedProfileData; detailIndex: number }> {
  const additionalImports: Array<{
    profile: GeneratedProfileData;
    detailIndex: number;
  }> = [];

  for (let i = 0; i < profileDataList.length; i++) {
    const profile = profileDataList[i];
    const metadata = profilesMetadata[i];

    // If profile needs more than 1 private detail, create additional imports
    // (first detail is created in initial import, so we need metadata.privateDetailsCount - 1 more)
    if (metadata.privateDetailsCount > 1) {
      for (
        let detailIndex = 1;
        detailIndex < metadata.privateDetailsCount;
        detailIndex++
      ) {
        const updatedProfile = generateUpdatedProfileData(profile, detailIndex);
        additionalImports.push({
          profile: updatedProfile,
          detailIndex,
        });
      }
    }
  }

  return additionalImports;
}

/**
 * Generates profile import JSON from generated profile data
 */
export function generateProfileImportJSON(
  profileDataList: GeneratedProfileData[],
): ProfileImportData {
  const profiles: ProfileImportUser[] = profileDataList.map((profile) => ({
    email: profile.email,
    phone: profile.phone,
    dateOfBirth: profile.dateOfBirth,
    ppsn: profile.ppsn,
    externalId: profile.externalId,
    firstName: profile.firstName,
    lastName: profile.lastName,
  }));

  return { profiles };
}
