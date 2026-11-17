import { httpErrors } from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { FastifyBaseLogger } from "fastify";
import { isHttpError } from "http-errors";
import type { Pool } from "pg";
import type { DB } from "../../db/schema.js";
import {
  type AttachmentShare,
  type DeletionRow,
  MessageModel,
} from "../../models/message-model.js";
import type {
  CreateMessageBody,
  Delivered,
  MessageList,
  PartialReadMessage,
  ReadMessage,
} from "../../types/messages.js";
import type {
  AcceptedQueryBooleanValues,
  PaginationParams,
} from "../../types/schemaDefinitions.js";
import { getM2MUploadSdk } from "../../utils/authentication-factory.js";
import { messagesCreatedCounter } from "../../utils/metrics.js";
import { ProfilePersonalSdkWrapper } from "../users/profile-personal-sdk-wrapper.js";
import { MessagesProcessor } from "./messages-processor.js";

interface LoggedInUserData {
  organizationId: string | undefined;
  userId: string;
  accessToken: string;
}

interface ListQuery {
  recipientUserId: string | undefined;
  organisationId: string | undefined;
  messagesStatus: Delivered | undefined;
  isSeen: AcceptedQueryBooleanValues | undefined;
  search: string | undefined;
  deletedAfterDateTime: string | undefined;
  tagId: string | undefined;
  untagged: boolean | undefined;
}

/**
 * Business logic for the `messages` domain. Composes {@link MessageModel} for
 * data access and keeps cross-service concerns (linked-profile resolution,
 * permission and consent checks) here, so route handlers stay thin controllers.
 */
export class MessageService {
  private readonly model: MessageModel;

  constructor(
    db: Kysely<DB>,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.model = new MessageModel(db);
  }

  async list(params: {
    loggedInUserData: LoggedInUserData;
    query: ListQuery;
    pagination: Required<PaginationParams>;
  }): Promise<{ data: MessageList; totalCount: number }> {
    const { loggedInUserData, query, pagination } = params;

    if (query.untagged && query.tagId) {
      throw httpErrors.badRequest(
        "'untagged' and 'tagId' are mutually exclusive",
      );
    }

    const requestedIds = await this.getRequestedIds(loggedInUserData, query);

    return this.model.listForInbox({
      recipientUserIds: requestedIds.userIds,
      organizationId: requestedIds.organizationId,
      pagination,
      query: {
        isSeen: query.isSeen,
        search: query.search,
        deletedAfterDateTime: query.deletedAfterDateTime,
        tagId: query.tagId,
        untagged: query.untagged,
      },
    });
  }

  async get(params: {
    messageId: string;
    userId?: string;
    loggedInUser: { userId: string; accessToken: string };
    hasOnboardingPermission: boolean;
    deleted?: boolean;
  }): Promise<ReadMessage | PartialReadMessage> {
    const message = await this.model.findByIdWithAttachments({
      messageId: params.messageId,
      userId: params.userId,
      deleted: params.deleted,
    });

    if (!message) {
      const errorMessage = params.userId
        ? `No message with id ${params.messageId} for the logged in user does exist`
        : `No message with id ${params.messageId} exist`;
      throw httpErrors.notFound(errorMessage);
    }

    // node-pg returns timestamp columns as Date objects, but the response
    // contract types `createdAt` as an ISO string. The 200 response is an
    // anyOf union of the full message and the redacted partial shape, and
    // fast-json-stringify selects the first branch whose data validates. A
    // Date value fails the full branch's `Type.String()` check, so the
    // serializer silently falls back to the partial branch and strips
    // subject/body/date even for the legitimate recipient. Coerce to a string
    // here so the full branch validates.
    message.createdAt = new Date(message.createdAt).toISOString();
    this.logger.debug(
      {
        messageId: `${params.messageId.substring(0, 5)}...`,
        recipientId: `${message.recipientUserId.substring(0, 4)}...`,
        isRecipientIdEqualToLoggedIn:
          message.recipientUserId === params.loggedInUser.userId,
      },
      "Retrieved message",
    );

    return this.prepareGetMessageResponse({
      loggedInUser: params.loggedInUser,
      hasOnboardingPermission: params.hasOnboardingPermission,
      message,
      messageId: params.messageId,
    });
  }

  async delete(params: {
    messageIds: string[];
    loggedInUser: { userId: string; accessToken: string };
  }): Promise<void> {
    await this.transition({
      ...params,
      action: "deleting",
      expectDeleted: false,
      apply: (ids) => this.model.softDeleteByIds(ids),
    });
  }

  /** Move soft-deleted messages back to the inbox. */
  async restore(params: {
    messageIds: string[];
    loggedInUser: { userId: string; accessToken: string };
  }): Promise<void> {
    await this.transition({
      ...params,
      action: "restoring",
      expectDeleted: true,
      apply: (ids) => this.model.restoreByIds(ids),
    });
  }

  /**
   * Erase soft-deleted messages for their recipient: the recipient loses the
   * messages and their attachments, the sender's record stays. Attachment
   * access goes first so a failure leaves the messages in Deleted to retry.
   */
  async erase(params: {
    messageIds: string[];
    loggedInUser: { userId: string; accessToken: string };
  }): Promise<void> {
    await this.transition({
      ...params,
      action: "erasing",
      expectDeleted: true,
      apply: async (ids) => {
        await this.removeAttachmentAccess(
          await this.model.findAttachmentsToUnshare(ids),
        );
        await this.model.eraseByIds(ids);
      },
    });
  }

  /**
   * Shared flow of delete, restore and erase: every id must exist in the
   * expected state (deleted or not) and belong to the user or a linked
   * profile, otherwise nothing changes.
   */
  private async transition(params: {
    messageIds: string[];
    loggedInUser: { userId: string; accessToken: string };
    action: string;
    expectDeleted: boolean;
    apply: (ids: string[]) => Promise<void>;
  }): Promise<void> {
    const uniqueMessageIds = Array.from(new Set(params.messageIds));
    try {
      const messages = await this.model.findForDeletion(uniqueMessageIds);

      if (messages.length !== uniqueMessageIds.length) {
        const notFoundIds = uniqueMessageIds.filter(
          (id) => !messages.some((message) => message.id === id),
        );
        this.logger.warn(
          { notFoundIds },
          `One or more messages not found while ${params.action}`,
        );
        throw httpErrors.notFound("One or more messages not found");
      }

      const byRecipientId = this.groupMessagesByStatus(
        messages,
        params.expectDeleted,
        params.action,
      );

      await this.validateDeletePermissions({
        byRecipientId,
        loggedInUser: params.loggedInUser,
      });

      await params.apply(uniqueMessageIds);
    } catch (error) {
      if (isHttpError(error)) {
        throw error;
      }
      throw httpErrors.internalServerError(
        `An unexpected error occurred while ${params.action} messages`,
      );
    }
  }

  private async removeAttachmentAccess(
    shares: AttachmentShare[],
  ): Promise<void> {
    const byOrganisation = Map.groupBy(shares, (share) => share.organisationId);
    for (const [organisationId, orgShares] of byOrganisation) {
      const upload = await getM2MUploadSdk(this.logger, organisationId);
      await Promise.all(
        orgShares.map(async ({ attachmentId, recipientUserId }) => {
          // The SDK types this call as returning `never`; it resolves to
          // `{ data, error }` like every other upload call.
          const result = (await upload.removeFileSharing(
            attachmentId,
            recipientUserId,
          )) as unknown as { error?: unknown } | undefined;
          if (result?.error) {
            throw httpErrors.createError(
              503,
              "Error removing access to the message attachments",
              { parent: result.error },
            );
          }
        }),
      );
    }
  }

  async assignTag(params: {
    userId: string;
    accessToken: string;
    messageIds: string[];
    tagId: string | null;
  }): Promise<{ tagId: string | null; messageIds: string[] }> {
    const { userId, accessToken, messageIds, tagId } = params;
    const uniqueMessageIds = Array.from(new Set(messageIds));

    const owners = await this.model.findOwners(uniqueMessageIds);
    if (owners.length < uniqueMessageIds.length) {
      throw httpErrors.notFound("Message not found");
    }

    // A message can be moved when it belongs to the logged-in user OR to one
    // of their linked profiles. The inbox lists messages for linked profiles
    // too, so validating against the logged-in user id alone would 404 on
    // messages the user can legitimately see and move.
    await this.ensureMessagesBelongToUserOrLinkedProfiles({
      recipientIds: owners.map((row) => row.userId),
      userId,
      accessToken,
    });

    if (tagId !== null) {
      const tag = await this.model.findTag(tagId);
      if (!tag || tag.userId !== userId) {
        throw httpErrors.notFound("Tag not found");
      }
    }

    await this.model.setTag(uniqueMessageIds, tagId);

    return { tagId, messageIds };
  }

  private async getRequestedIds(
    loggedInUserData: LoggedInUserData,
    query: {
      recipientUserId: string | undefined;
      organisationId: string | undefined;
    },
  ): Promise<{ userIds: string[]; organizationId: string | undefined }> {
    if (loggedInUserData.organizationId) {
      throw httpErrors.forbidden("Public servant can't access messages");
    }
    // if the citizen is asking specifically for its own data,
    // without linked ids, then return only its own data
    if (loggedInUserData.userId === query.recipientUserId) {
      return {
        userIds: [query.recipientUserId],
        organizationId: query.organisationId,
      };
    }

    const linkedProfilesIds = await this.getLinkedProfiles(loggedInUserData);

    const userIds = [loggedInUserData.userId, ...linkedProfilesIds];

    if (!query.recipientUserId) {
      return { userIds, organizationId: query.organisationId };
    }

    if (userIds.includes(query.recipientUserId)) {
      return {
        userIds: [query.recipientUserId],
        organizationId: query.organisationId,
      };
    }

    throw httpErrors.forbidden(
      "Not allowed to see messages for the requested user",
    );
  }

  private async prepareGetMessageResponse(params: {
    loggedInUser: { userId: string; accessToken: string };
    hasOnboardingPermission: boolean;
    message: ReadMessage;
    messageId: string;
  }): Promise<ReadMessage | PartialReadMessage> {
    const { loggedInUser, hasOnboardingPermission, message, messageId } =
      params;

    if (loggedInUser.userId === message.recipientUserId) {
      this.logger.debug("Logged user id is the same as the recipient");
      return message;
    }

    if (hasOnboardingPermission) {
      this.logger.debug(
        "Logged user has onboarding permissions, returning partial info",
      );
      return {
        recipientUserId: message.recipientUserId,
        organisationId: message.organisationId,
      };
    }

    const linkedProfilesIds = await this.getLinkedProfilesOrEmpty({
      ...loggedInUser,
      organizationId: undefined,
    });

    if (linkedProfilesIds.includes(message.recipientUserId)) {
      this.logger.debug(
        "Recipient user is linked to logged in user, returning the message",
      );
      return message;
    }

    throw httpErrors.notFound(
      `No message with id ${messageId} for the logged in user does exist`,
    );
  }

  /**
   * Same as {@link getLinkedProfiles}, but a Forbidden from the upstream
   * profile SDK (the logged-in user's own-token lookup) is treated as "no
   * linked profiles" rather than rethrown. ProfileSdkWrapper.getProfile maps
   * any non-404 SDK error to a local 503, keeping the original status on
   * `.parent`, so a Forbidden-sourced failure must be detected there.
   * A citizen who isn't linked to anything gets Forbidden here, same as one
   * who genuinely isn't linked — the citizen portal's account-linking flow
   * needs a 404 to retry via M2M either way (AB#45455). A genuine profile-api
   * outage (anything but a wrapped 403) still surfaces as 503.
   */
  private async getLinkedProfilesOrEmpty(
    userData: LoggedInUserData,
  ): Promise<string[]> {
    try {
      return await this.getLinkedProfiles(userData);
    } catch (error) {
      if (isHttpError(error) && this.isForbiddenFromProfileSdk(error)) {
        this.logger.debug(
          "Linked-profiles lookup was forbidden, treating as not linked",
        );
        return [];
      }
      throw error;
    }
  }

  private isForbiddenFromProfileSdk(error: {
    statusCode: number;
    parent?: unknown;
  }): boolean {
    if (error.statusCode === 403) {
      return true;
    }
    const parentStatus =
      error.parent && typeof error.parent === "object"
        ? (error.parent as { statusCode?: unknown }).statusCode
        : undefined;
    return error.statusCode === 503 && parentStatus === 403;
  }

  private groupMessagesByStatus(
    messages: DeletionRow[],
    expectDeleted: boolean,
    action: string,
  ): Record<string, string[]> {
    const wrongState: string[] = [];
    const byRecipientId: Record<string, string[]> = {};

    for (const message of messages) {
      if (Boolean(message.deletedAt) !== expectDeleted) {
        wrongState.push(message.id);
      } else {
        if (!byRecipientId[message.recipientUserId]) {
          byRecipientId[message.recipientUserId] = [];
        }
        byRecipientId[message.recipientUserId].push(message.id);
      }
    }

    if (wrongState.length > 0) {
      this.logger.warn(
        { wrongStateIds: wrongState },
        `One or more messages in the wrong state while ${action}`,
      );
      throw httpErrors.notFound("One or more messages not found");
    }

    return byRecipientId;
  }

  private async validateDeletePermissions(params: {
    byRecipientId: Record<string, string[]>;
    loggedInUser: { userId: string; accessToken: string };
  }): Promise<void> {
    const { byRecipientId, loggedInUser } = params;
    const recipientIds = Object.keys(byRecipientId);

    const hasOtherRecipients = recipientIds.some(
      (id) => id !== loggedInUser.userId,
    );

    let validUserIds = [loggedInUser.userId];
    if (hasOtherRecipients) {
      const linkedProfiles = await this.getLinkedProfiles({
        organizationId: undefined,
        userId: loggedInUser.userId,
        accessToken: loggedInUser.accessToken,
      });
      validUserIds = Array.from(
        new Set([loggedInUser.userId, ...linkedProfiles]),
      );
    }

    const invalidRecipientIds = recipientIds.filter(
      (recipientId) => !validUserIds.includes(recipientId),
    );
    if (invalidRecipientIds.length > 0) {
      this.logger.warn(
        { invalidRecipientIds },
        "User attempted to delete messages for recipient ids they don't have access to",
      );
      throw httpErrors.forbidden("Not allowed to delete one or more messages");
    }
  }

  private async ensureMessagesBelongToUserOrLinkedProfiles(params: {
    recipientIds: string[];
    userId: string;
    accessToken: string;
  }): Promise<void> {
    const { recipientIds, userId, accessToken } = params;
    const uniqueRecipientIds = Array.from(new Set(recipientIds));

    // Only reach out to the profile service when a message is addressed to
    // someone other than the logged-in user, mirroring the delete flow.
    const hasOtherRecipients = uniqueRecipientIds.some((id) => id !== userId);
    let validUserIds = [userId];
    if (hasOtherRecipients) {
      const linkedProfiles = await this.getLinkedProfiles({
        organizationId: undefined,
        userId,
        accessToken,
      });
      validUserIds = Array.from(new Set([userId, ...linkedProfiles]));
    }

    const invalidRecipientIds = uniqueRecipientIds.filter(
      (id) => !validUserIds.includes(id),
    );
    if (invalidRecipientIds.length > 0) {
      this.logger.warn(
        { invalidRecipientIds },
        "User attempted to move messages they don't have access to",
      );
      throw httpErrors.notFound("Message not found");
    }
  }

  private async getLinkedProfiles(
    userData: LoggedInUserData,
  ): Promise<string[]> {
    const profileSdk = new ProfilePersonalSdkWrapper(this.logger, userData);
    return profileSdk.getLinkedProfileIds(userData.userId);
  }
}

/**
 * Build a {@link MessageService} from a raw pg {@link Pool}. Used by the
 * backward-compatible function wrappers below (and by tests) that still pass a
 * pool; route handlers instead construct the service from `app.db` directly.
 */
const serviceFromPool = (
  pool: Pool,
  logger: FastifyBaseLogger,
): MessageService => new MessageService(createDbFromPool<DB>(pool), logger);

export async function listMessages(params: {
  loggedInUserData: LoggedInUserData;
  query: ListQuery;
  pool: Pool;
  pagination: Required<PaginationParams>;
  logger: FastifyBaseLogger;
}): Promise<{ data: MessageList; totalCount: number }> {
  return serviceFromPool(params.pool, params.logger).list({
    loggedInUserData: params.loggedInUserData,
    query: params.query,
    pagination: params.pagination,
  });
}

export async function getMessage(params: {
  pool: Pool;
  userId?: string;
  messageId: string;
  loggedInUser: { userId: string; accessToken: string };
  hasOnboardingPermission: boolean;
  logger: FastifyBaseLogger;
  deleted?: boolean;
}): Promise<ReadMessage | PartialReadMessage> {
  return serviceFromPool(params.pool, params.logger).get({
    messageId: params.messageId,
    userId: params.userId,
    loggedInUser: params.loggedInUser,
    hasOnboardingPermission: params.hasOnboardingPermission,
    deleted: params.deleted,
  });
}

export async function deleteMessages(params: {
  pool: Pool;
  messageIds: string[];
  logger: FastifyBaseLogger;
  loggedInUser: { userId: string; accessToken: string };
}): Promise<void> {
  return serviceFromPool(params.pool, params.logger).delete({
    messageIds: params.messageIds,
    loggedInUser: params.loggedInUser,
  });
}

export async function restoreMessages(params: {
  pool: Pool;
  messageIds: string[];
  logger: FastifyBaseLogger;
  loggedInUser: { userId: string; accessToken: string };
}): Promise<void> {
  return serviceFromPool(params.pool, params.logger).restore({
    messageIds: params.messageIds,
    loggedInUser: params.loggedInUser,
  });
}

export async function eraseMessages(params: {
  pool: Pool;
  messageIds: string[];
  logger: FastifyBaseLogger;
  loggedInUser: { userId: string; accessToken: string };
}): Promise<void> {
  return serviceFromPool(params.pool, params.logger).erase({
    messageIds: params.messageIds,
    loggedInUser: params.loggedInUser,
  });
}

export async function assignMessageTag(params: {
  pool: Pool;
  userId: string;
  accessToken: string;
  messageIds: string[];
  tagId: string | null;
  logger: FastifyBaseLogger;
}): Promise<{ tagId: string | null; messageIds: string[] }> {
  return serviceFromPool(params.pool, params.logger).assignTag({
    userId: params.userId,
    accessToken: params.accessToken,
    messageIds: params.messageIds,
    tagId: params.tagId,
  });
}

export async function processMessage(params: {
  pool: Pool;
  sender: {
    id: string;
    organizationId: string;
    isM2MApplication: boolean;
  };
  message: CreateMessageBody;
  logger: FastifyBaseLogger;
  // The citizen's geohash, from the request's baggage
  geohash?: string;
}) {
  const messagesProcessor = new MessagesProcessor(params.pool, params.logger);

  const result = await messagesProcessor.processMessage({
    message: params.message,
    senderUser: params.sender,
    geohash: params.geohash,
  });

  messagesCreatedCounter.add(1, {
    organizationId: params.sender.organizationId,
  });

  return result;
}
