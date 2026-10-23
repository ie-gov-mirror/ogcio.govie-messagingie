import { randomUUID } from "node:crypto";
import { faker } from "@faker-js/faker";
import { Pool, type PoolClient } from "pg";
import type { SeederConfiguration } from "../configuration.js";
import type { GeneratedProfileData } from "../data-generation/profile-generator.js";

/**
 * Updates Logto identities with diid (MyGovId) information
 */
export async function updateLogtoIdentities(
  profileIds: Map<string, string>, // email -> profileId
  profileDataList: GeneratedProfileData[],
  config: SeederConfiguration,
  resultsTracker?: {
    recordLogtoIdentityUpdated: (email: string, profileId: string) => void;
    recordError: (email: string, message: string) => void;
  },
): Promise<void> {
  const pool = new Pool({
    connectionString: config.logtoDatabaseConnectionString,
  });

  let client: PoolClient | null = null;

  try {
    client = await pool.connect();

    // Create a map of profileId -> GeneratedProfileData for quick lookup
    const profileDataMap = new Map<string, GeneratedProfileData>();
    for (const profileData of profileDataList) {
      const profileId = profileIds.get(profileData.email);
      if (profileId) {
        profileDataMap.set(profileId, profileData);
      }
    }

    // Update each profile's identity
    for (const [email, profileId] of profileIds.entries()) {
      const profileData = profileDataMap.get(profileId);
      if (!profileData) {
        console.warn(
          `[Seeder] No profile data found for profileId: ${profileId}`,
        );
        resultsTracker?.recordError(
          email,
          `No profile data found for profileId: ${profileId}`,
        );
        continue;
      }

      try {
        // Build the identity structure matching logtoIdentity format
        const now = Math.floor(Date.now() / 1000);
        const identity = {
          "MyGovId (MyGovId connector)": {
            userId: profileData.myGovId,
            details: {
              id: profileData.myGovId,
              name: `${profileData.firstName} ${profileData.lastName}`,
              email: profileData.email,
              phone: profileData.phone,
              rawData: {
                aud: "mock_client_id",
                exp: now + 3600,
                iat: now,
                iss: "http://localhost:4005",
                nbf: now,
                oid: Buffer.from(randomUUID()).toString("base64"),
                sub: profileData.myGovId,
                ver: "1.0",
                email: profileData.email,
                mobile: profileData.phone,
                surname: profileData.lastName,
                lastName: profileData.lastName,
                BirthDate: profileData.dateOfBirth,
                auth_time: Date.now(),
                firstName: profileData.firstName,
                givenName: profileData.firstName,
                CustomerId: faker.number.int({ min: 100, max: 999 }).toString(),
                LastJourney: "Login",
                AlternateIds: "",
                CorrelationId: faker.string.alphanumeric(32),
                SMS2FAEnabled: false,
                DSPOnlineLevel: "2",
                currentCulture: "en",
                PublicServiceNumber: profileData.ppsn,
                AcceptedPrivacyTerms: true,
                DSPOnlineLevelStatic: "2",
                trustFrameworkPolicy: "B2C_1A_MyGovID_signin-v5-PARTIAL2",
                AcceptedPrivacyTermsDateTime: now,
                AcceptedPrivacyTermsVersionNumber: "7",
              },
            },
          },
        };

        // Update the identities JSONB column in the users table
        // The profileId from the profile service should match the user id in Logto
        const updateQuery = `
          UPDATE users
          SET identities = $1::jsonb,
              updated_at = NOW()
          WHERE id = $2
        `;

        const result = await client.query(updateQuery, [
          JSON.stringify(identity),
          profileId,
        ]);

        if (result.rowCount === 0) {
          console.warn(
            `[Seeder] No user found in Logto DB for profileId: ${profileId}`,
          );
          resultsTracker?.recordError(
            email,
            `No user found in Logto DB for profileId: ${profileId}`,
          );
        } else {
          resultsTracker?.recordLogtoIdentityUpdated(email, profileId);
        }
      } catch (error) {
        console.error(
          `[Seeder] Error updating Logto identity for ${email}: ${(error as Error).message}`,
        );
        resultsTracker?.recordError(
          email,
          `Failed to update Logto identity: ${(error as Error).message}`,
        );
      }
    }

    console.log(
      `[Seeder] Updated Logto identities for ${profileIds.size} profiles`,
    );
  } catch (error) {
    console.error(
      `[Seeder] Error updating Logto identities: ${(error as Error).message}`,
    );
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}
