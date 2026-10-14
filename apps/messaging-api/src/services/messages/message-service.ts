import { httpErrors } from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { FastifyBaseLogger } from "fastify";
import { isHttpError } from "http-errors";
import type { Pool } from "pg";
import type { DB } from "../../db/schema.js";
import { MessageModel } from "../../models/message-model.js";
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
    const uniqueMessageIds = Array.from(new Set(params.messageIds));
    try {
      const messages = await this.model.findForDeletion(uniqueMessageIds);

      if (messages.length !== uniqueMessageIds.length) {
        const notFoundIds = uniqueMessageIds.filter(
          (id) => !messages.some((message) => message.id === id),
        );
        this.logger.warn(
          { notFoundIds },
          "One or more messages not found during delete operation",
        );
        throw httpErrors.notFound("One or more messages not found");
      }

      const byRecipientId = this.groupMessagesByStatus(messages);

      await this.validateDeletePermissions({
        byRecipientId,
        loggedInUser: params.loggedInUser,
      });

      await this.model.softDeleteByIds(uniqueMessageIds);
    } catch (error) {
      if (isHttpError(error)) {
        throw error;
      }
      throw httpErrors.internalServerError(
        "An unexpected error occurred while deleting messages",
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

    const linkedProfilesIds = await this.getLinkedProfiles({
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

  private groupMessagesByStatus(
    messages: { id: string; deletedAt: Date | null; recipientUserId: string }[],
  ): Record<string, string[]> {
    const alreadyDeleted: string[] = [];
    const byRecipientId: Record<string, string[]> = {};

    for (const message of messages) {
      if (message.deletedAt) {
        alreadyDeleted.push(message.id);
      } else {
        if (!byRecipientId[message.recipientUserId]) {
          byRecipientId[message.recipientUserId] = [];
        }
        byRecipientId[message.recipientUserId].push(message.id);
      }
    }

    if (alreadyDeleted.length > 0) {
      this.logger.warn(
        { alreadyDeletedIds: alreadyDeleted },
        "One or more messages already deleted during delete operation",
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
}) {
  const messagesProcessor = new MessagesProcessor(params.pool, params.logger);

  const result = await messagesProcessor.processMessage({
    message: params.message,
    senderUser: params.sender,
  });

  messagesCreatedCounter.add(1, {
    organizationId: params.sender.organizationId,
  });

  return result;
}
