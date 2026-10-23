import type { SeederConfiguration } from "../configuration.js";
import { getManagementApiToken } from "../sdk/sdk-factory.js";
import type { SeedingResultsTracker } from "./seeding-results-tracker.js";

/**
 * Assigns roles to users using Logto Management API
 * Assigns both "onboarded-citizen" and "citizen" roles
 */
export async function assignRolesToUsers(
  profileIds: Map<string, string>, // email -> profileId
  config: SeederConfiguration,
  resultsTracker?: SeedingResultsTracker,
): Promise<void> {
  console.log("[Seeder] Assigning roles to users...");

  if (profileIds.size === 0) {
    console.log("[Seeder] No profiles to assign roles for");
    return;
  }

  // Get management API token
  const managementToken = await getManagementApiToken(config);

  // Roles to assign
  const rolesToAssign = ["onboarded-citizen", "bb-citizen"];

  // Process in batches
  const batchSize = config.batchSize || 25;
  const userIds = Array.from(profileIds.values());
  const emailArray = Array.from(profileIds.entries());
  const processedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  // Normalize endpoint URL (remove trailing slash if present)
  const baseUrl = config.logtoManagementApiEndpoint.replace(/\/$/, "");
  console.log(
    `[Seeder] Assigning roles "${rolesToAssign.join(", ")}" to users...`,
  );
  for (const userId of userIds) {
    try {
      const response = await fetch(`${baseUrl}/users/${userId}/roles`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${managementToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roleIds: rolesToAssign,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to assign roles to user ${userId}: ${response.status} ${errorText}`,
        );
      }
      successCount++;

      console.log(
        `[Seeder] Assigned roles "${rolesToAssign.join(
          ", ",
        )}" to ${userId} user`,
      );
    } catch (error) {
      const errorMessage = `Failed to assign roles to user ${userId}: ${
        (error as Error).message
      }`;
      console.error(`[Seeder] ${errorMessage}`);
      const emailEntry = emailArray.find(([, id]) => id === userId);
      if (emailEntry && resultsTracker) {
        const [email] = emailEntry;
        resultsTracker.recordError(email, errorMessage);
      }
      errorCount++;
    }
  }

  console.log(
    `[Seeder] Role assignment completed: ${successCount} role assignments successful, ${errorCount} role assignments failed`,
  );
}
