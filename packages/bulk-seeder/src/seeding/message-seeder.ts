import type { SeederConfiguration } from "../configuration.js";
import type { GeneratedProfileData } from "../data-generation/profile-generator.js";
import type { SeederSDKs } from "../sdk/sdk-factory.js";
import type { SeedingMetadata } from "../seeding-metadata.js";
import { extractSDKErrorDetail } from "../utils/error-helpers.js";
import { logCompletionSummary, logProgress } from "../utils/logging-helpers.js";
import {
  createEmailToMetadataMap,
  createEmailToProfileDataMap,
} from "../utils/profile-helpers.js";
import type { SeedingResultsTracker } from "./seeding-results-tracker.js";

/**
 * Uploads and shares a single attachment file for reuse across all messages
 */
export async function uploadAndShareAttachmentFile(
  uploadSDK: SeederSDKs["upload"],
  config: SeederConfiguration,
): Promise<string> {
  console.log("[Seeder] Uploading attachment file...");

  try {
    // 1. Create dummy file content (e.g., a simple text file)
    // Create a 100KB file with dummy content for seeding purposes
    const fileContent = Buffer.alloc(100000, "A"); // 100KB file filled with 'A'
    const file = new File([fileContent], "seed-attachment.pdf", {
      type: "application/pdf",
    });

    // 2. Upload file using SDK
    const uploadResult = await uploadSDK.uploadFile(file);

    if (uploadResult.error) {
      const errorObj = uploadResult.error as Record<string, unknown>;
      const errorDetail = extractSDKErrorDetail(errorObj);
      throw new Error(`SDK error: ${errorDetail}`);
    }

    // 3. Get file ID from response
    const fileId = uploadResult.data?.uploadId;
    if (!fileId) {
      throw new Error("File uploaded but no ID returned");
    }

    // 4. Note: File sharing with recipients is typically handled automatically
    // when the file is attached to messages, or may require additional SDK calls
    // depending on the upload service API implementation

    console.log(`[Seeder] Attachment file uploaded: ${fileId}`);
    return fileId;
  } catch (error) {
    const errorMessage = `Failed to upload attachment file: ${(error as Error).message}`;
    console.error("[Seeder] Error uploading attachment file:", errorMessage);
    throw error;
  }
}

/**
 * Generates message content for a profile
 */
function generateMessageContent(
  profileData: GeneratedProfileData,
  index: number,
): {
  subject: string;
  plainText: string;
  excerpt?: string;
} {
  const subject = `Message ${index + 1} for ${profileData.firstName} ${profileData.lastName}`;
  const plainText = `This is a test message for ${profileData.firstName} ${profileData.lastName} (${profileData.email}). Generated for seeding purposes.`;
  const excerpt = `Test message for ${profileData.firstName}`;

  return {
    subject,
    plainText,
    excerpt,
  };
}

/**
 * Seeds messages for profiles using SDK
 */
export async function seedMessages(
  profileIds: Map<string, string>, // email -> profileId
  profilesMetadata: SeedingMetadata[],
  profileDataList: GeneratedProfileData[],
  sharedFileId: string,
  sdks: SeederSDKs,
  config: SeederConfiguration,
  resultsTracker?: SeedingResultsTracker,
): Promise<void> {
  console.log("[Seeder] Seeding messages...");

  if (profileIds.size === 0) {
    console.log("[Seeder] No profiles to seed messages for");
    return;
  }

  // Create maps for quick lookup
  const emailToMetadata = createEmailToMetadataMap(
    profileDataList,
    profilesMetadata,
    profileIds,
  );
  const emailToProfileData = createEmailToProfileDataMap(
    profileDataList,
    profilesMetadata,
    profileIds,
  );

  // Process messages in batches
  const batchSize = config.batchSize || 25;
  const emailArray = Array.from(profileIds.entries());
  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  let messageIndex = 0;

  // Track which recipients have already had the file shared with them
  const sharedWithRecipients = new Set<string>();

  for (let i = 0; i < emailArray.length; i += batchSize) {
    const batch = emailArray.slice(i, i + batchSize);

    // Process batch in parallel
    const batchPromises = batch.map(async ([email, profileId]) => {
      const metadata = emailToMetadata.get(email);
      const profileData = emailToProfileData.get(email);

      if (!metadata || !profileData) {
        console.warn(
          `[Seeder] No metadata or profile data found for email: ${email}`,
        );
        return;
      }

      // Skip if no messages to create for this profile
      if (metadata.messagesCount === 0) {
        return;
      }

      // Create messages for this profile
      const messagesToCreate = metadata.messagesCount;
      const attachmentsToAdd = metadata.attachmentsCount;

      for (let msgIdx = 0; msgIdx < messagesToCreate; msgIdx++) {
        const currentMessageIndex = messageIndex++;
        const messageContent = generateMessageContent(
          profileData,
          currentMessageIndex,
        );

        // Determine if this message should have an attachment
        const hasAttachment = msgIdx < attachmentsToAdd;

        try {
          // Share the attachment with the recipient if needed
          if (
            hasAttachment &&
            sharedFileId &&
            !sharedWithRecipients.has(profileId)
          ) {
            try {
              const shareResult = await sdks.upload.shareFile(
                sharedFileId,
                profileId,
              );

              if (shareResult.error) {
                const errorObj = shareResult.error as Record<string, unknown>;
                const errorDetail = extractSDKErrorDetail(errorObj);
                console.warn(
                  `[Seeder] Failed to share file with ${email}: ${errorDetail}. Continuing...`,
                );
                // Continue even if sharing fails - the attachment might still work
              } else {
                sharedWithRecipients.add(profileId);
                console.log(
                  `[Seeder] Shared attachment file with recipient: ${email}`,
                );
              }
            } catch (shareError) {
              console.warn(
                `[Seeder] Error sharing file with ${email}: ${(shareError as Error).message}. Continuing...`,
              );
              // Continue even if sharing fails - the attachment might still work
            }
          }

          // Create message using SDK send method
          const response = await sdks.messaging.send({
            preferredTransports: ["email", "lifeEvent"],
            recipientUserId: profileId,
            security: "confidential",
            scheduleAt: new Date().toISOString(),
            message: {
              subject: messageContent.subject,
              plainText: messageContent.plainText,
              excerpt: messageContent.excerpt,
              language: "en",
            },
            attachments:
              hasAttachment && sharedFileId ? [sharedFileId] : undefined,
          });

          if (response.error) {
            const errorObj = response.error as Record<string, unknown>;
            const errorDetail = extractSDKErrorDetail(errorObj);
            throw new Error(`SDK error: ${errorDetail}`);
          }

          // Get message ID from response
          const messageId = response.data?.id;
          if (!messageId) {
            throw new Error("Message created but no ID returned");
          }

          // Record success
          if (resultsTracker) {
            resultsTracker.recordMessageCreated(email, profileId, messageId);

            // Record attachment if present
            if (hasAttachment && sharedFileId) {
              resultsTracker.recordAttachmentCreated(
                email,
                profileId,
                sharedFileId,
              );
            }
          }
          successCount++;
        } catch (error) {
          const errorMessage = `Failed to create message ${msgIdx + 1}/${messagesToCreate}: ${(error as Error).message}`;
          console.error(
            `[Seeder] Error seeding message for ${email}:`,
            errorMessage,
          );
          if (resultsTracker) {
            resultsTracker.recordError(email, errorMessage);
          }
          errorCount++;
        }
      }
    });

    await Promise.all(batchPromises);
    processedCount += batch.length;
    logProgress(processedCount, emailArray.length, "messages");
  }

  logCompletionSummary("Messages seeding", successCount, errorCount);
}
