import { Pool } from "pg";
import {
  type SeederConfiguration,
  getSeederConfiguration,
} from "./configuration.js";
import { generateAllProfileData } from "./data-generation/profile-generator.js";
import {
  generateProfileImportJSON,
  splitProfilesByOrgDetails,
} from "./data-generation/profile-generator.js";
import { createSeederSDKs } from "./sdk/sdk-factory.js";
import {
  GenerateSeedingMetadata,
  type SeedingMetadata,
} from "./seeding-metadata.js";
import { SeedingMetrics } from "./seeding-metrics.js";
import { createAdditionalPrivateDetails } from "./seeding/additional-private-details-seeder.js";
import { seedConsents } from "./seeding/consent-seeder.js";
import { seedDetails } from "./seeding/details-seeder.js";
import { updateLogtoIdentities } from "./seeding/logto-identity-updater.js";
import { uploadAndShareAttachmentFile as uploadAttachmentFile } from "./seeding/message-seeder.js";
import { seedMessages } from "./seeding/message-seeder.js";
import { pollForProfileImportCompletion } from "./seeding/profile-import-poller.js";
import { retrieveProfilesByPPSNs } from "./seeding/profile-retriever.js";
import { assignRolesToUsers } from "./seeding/role-assignment-seeder.js";
import { SeedingResultsTracker } from "./seeding/seeding-results-tracker.js";
import { getProfileImportId } from "./utils/sdk-helpers.js";

/**
 * Validates Logto database connection
 */
async function validateLogtoDatabaseConnection(
  config: SeederConfiguration,
): Promise<void> {
  if (!config.enableMyGovIdIdentityInjection) {
    console.log(
      "[Seeder] MyGovID identity injection is disabled. Skipping Logto Database connection validation.",
    );
    return;
  }
  console.log(
    "[Seeder] Testing connection to Logto Database...",
    config.logtoDatabaseConnectionString,
  );
  const pool = new Pool({
    connectionString: config.logtoDatabaseConnectionString,
    connectionTimeoutMillis: 3000,
  });
  try {
    await pool.query("SELECT 1");
    console.log("[Seeder] Successfully connected to Logto Database");
  } catch (error) {
    console.error(
      `[Seeder] Failed to connect to Logto Database: ${(error as Error).message}`,
    );
    throw error;
  } finally {
    await pool.end();
    console.log("[Seeder] Ended pool");
  }
}

/**
 * Main seeder function
 */
export async function seeder(): Promise<void> {
  console.log("[Seeder] Starting...");

  try {
    // 1. Load configuration
    const config = getSeederConfiguration();

    // 2. Validate Logto database connection
    await validateLogtoDatabaseConnection(config);

    // 3. Initialize SDKs
    const sdks = createSeederSDKs(config);

    // 4. Generate seeding metadata
    const metadataGenerator = new GenerateSeedingMetadata(
      config.profilesToSeed,
    );
    const profilesMetadata = metadataGenerator.generateMetadata();

    console.log(
      `[Seeder] Generated seeding metadata for ${profilesMetadata.length} profiles.`,
    );
    console.log(metadataGenerator.getSummary());

    // 5. Generate profile data with PPSNs
    const profileDataList = generateAllProfileData(profilesMetadata, config);

    // 6. Initialize seeding results tracker
    const resultsTracker = new SeedingResultsTracker(config);

    // 7. Upload and share single attachment file
    const sharedFileId = await uploadAttachmentFile(sdks.upload, config);

    // 8. Split profiles into two groups: private-only and with-org
    const { privateOnlyProfiles, withOrgProfiles } = splitProfilesByOrgDetails(
      profileDataList,
      profilesMetadata,
    );

    // 9. Import profiles with only private details
    let privateOnlyImportId: string | null = null;
    if (privateOnlyProfiles.length > 0) {
      console.log(
        `[Seeder] Importing ${privateOnlyProfiles.length} profiles with only private details...`,
      );
      const privateOnlyImportData =
        generateProfileImportJSON(privateOnlyProfiles);
      const result = await sdks.profile.importProfiles(
        { records: privateOnlyImportData.profiles },
        true,
        true,
        "full",
      );
      privateOnlyImportId = getProfileImportId(result);

      if (privateOnlyImportId) {
        await pollForProfileImportCompletion(
          privateOnlyImportId,
          config,
          sdks.profile,
        );
      }
    }

    // 10. Import profiles with both private and organization details
    let withOrgImportId: string | null = null;
    if (withOrgProfiles.length > 0) {
      console.log(
        `[Seeder] Importing ${withOrgProfiles.length} profiles with private and organization details...`,
      );
      const withOrgImportData = generateProfileImportJSON(withOrgProfiles);
      const result = await sdks.profile.importProfiles(
        { records: withOrgImportData.profiles },
        true,
        false,
        "full",
      );
      withOrgImportId = getProfileImportId(result);

      if (withOrgImportId) {
        await pollForProfileImportCompletion(
          withOrgImportId,
          config,
          sdks.profile,
        );
      }
    }

    // 11. Create additional private details for profiles that need multiple private details
    await createAdditionalPrivateDetails(
      profileDataList,
      profilesMetadata,
      sdks.profile,
      config,
    );

    // 12. Retrieve created profiles using SDK with batched PPSN searches
    const profileIds = await retrieveProfilesByPPSNs(
      profileDataList,
      sdks.profile,
      config,
      resultsTracker,
    );

    console.log(
      `[Seeder] Retrieved ${profileIds.size} profiles from ${profileDataList.length} total`,
    );

    // 13. Assign roles to users (onboarded-citizen and citizen)
    await assignRolesToUsers(profileIds, config, resultsTracker);

    // 14. Update Logto identities
    if (config.enableMyGovIdIdentityInjection) {
      await updateLogtoIdentities(
        profileIds,
        profileDataList,
        config,
        resultsTracker,
      );
    } else {
      console.log(
        "[Seeder] MyGovID identity injection is disabled. Skipping Logto identity updates.",
      );
    }

    // 15. Seed additional data (consents, details, messages, attachments)
    await seedConsents(
      profileIds,
      profilesMetadata,
      profileDataList,
      sdks.profile,
      config,
      resultsTracker,
    );

    await seedDetails(
      profileIds,
      profilesMetadata,
      profileDataList,
      config,
      resultsTracker,
    );

    await seedMessages(
      profileIds,
      profilesMetadata,
      profileDataList,
      sharedFileId,
      sdks,
      config,
      resultsTracker,
    );

    // 16. Save seeding results to file
    //await resultsTracker.saveResults();

    console.log("[Seeder] Completed successfully");
  } catch (error) {
    console.error(`[Seeder] Error: ${(error as Error).message}`);
    throw error;
  }
}
