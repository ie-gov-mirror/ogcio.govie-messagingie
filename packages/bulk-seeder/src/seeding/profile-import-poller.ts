// Using any for Profile type as types may not be available at build time
import type { Profile } from "@ogcio/building-blocks-sdk/dist/types/index.js";
import type { SeederConfiguration } from "../configuration.js";
import { ProfileImportError } from "../errors/seeding-errors.js";
import { sleep } from "../utils/sdk-helpers.js";

/**
 * Polls for profile import completion
 */
export async function pollForProfileImportCompletion(
  profileImportId: string,
  config: SeederConfiguration,
  profileSDK: Profile,
): Promise<void> {
  let attempts = 0;

  while (attempts < config.maxPollAttempts) {
    try {
      const status = await profileSDK.getProfileImport(profileImportId);

      if (status.data?.status === "completed") {
        console.log(
          `[Seeder] Profile import ${profileImportId} completed successfully`,
        );
        return;
      }

      if (status.data?.status === "failed") {
        throw new ProfileImportError(
          `Profile import ${profileImportId} failed`,
          profileImportId,
          { status },
        );
      }

      // Status is "pending" or "processing", continue polling
      attempts++;
      if (attempts < config.maxPollAttempts) {
        await sleep(config.pollIntervalMs);
      }
    } catch (error) {
      if (error instanceof ProfileImportError) {
        throw error;
      }
      throw new ProfileImportError(
        `Error checking profile import status: ${(error as Error).message}`,
        profileImportId,
        { originalError: error },
      );
    }
  }

  throw new ProfileImportError(
    `Profile import ${profileImportId} did not complete within ${config.maxPollAttempts} attempts`,
    profileImportId,
  );
}
