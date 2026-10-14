import { httpErrors } from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { FastifyBaseLogger } from "fastify";
import type { Pool } from "pg";
import type { DB } from "../../db/schema.js";
import { MessageActionModel } from "../../models/message-action-model.js";
import type { PutMessageActionBody } from "../../types/message-actions.js";
import { messagesReadCounter } from "../../utils/metrics.js";
import {
  MessagingEventLogger,
  MessagingEventType,
} from "../messages/event-logger.js";
import { ProfilePersonalSdkWrapper } from "../users/profile-personal-sdk-wrapper.js";

/**
 * Business logic for the `message-actions` domain. Composes
 * {@link MessageActionModel} for data access (recipient lookup + read-status
 * update via db-core/Kysely) and keeps the permission checks, metrics and
 * event logging here, so route handlers stay thin controllers.
 *
 * The event logging side effect still writes through the shared
 * {@link MessagingEventLogger}, which operates on a raw pg pool, so the service
 * is constructed with both `app.db` (data access) and `app.pg.pool`
 * (event logging), mirroring the incremental pg/db coexistence.
 */
export class MessageActionService {
  private readonly model: MessageActionModel;

  constructor(
    db: Kysely<DB>,
    private readonly pool: Pool,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.model = new MessageActionModel(db);
  }

  async update(params: {
    loggedInUser: { userId: string; accessToken: string };
    body: PutMessageActionBody;
  }): Promise<void> {
    const { loggedInUser, body } = params;

    const recipient = await this.model.findRecipient(body.messageId);
    if (!recipient) {
      throw httpErrors.notFound("message not found");
    }
    if (recipient.recipientUserId !== loggedInUser.userId) {
      const profileSdk = new ProfilePersonalSdkWrapper(
        this.logger,
        loggedInUser,
      );
      const linkedProfilesIds = await profileSdk.getLinkedProfileIds(
        loggedInUser.userId,
      );

      if (!linkedProfilesIds.includes(recipient.recipientUserId)) {
        throw httpErrors.notFound("message not found for user");
      }
    }

    await this.setMessageReadStatus({
      body,
      userId: recipient.recipientUserId,
      organizationId: recipient.organizationId,
    });
  }

  private async setMessageReadStatus(params: {
    body: PutMessageActionBody;
    userId: string;
    organizationId: string;
  }): Promise<void> {
    const updatedRows = await this.model.setReadStatus({
      userId: params.userId,
      messageId: params.body.messageId,
      isSeen: params.body.isSeen,
    });

    if (updatedRows) {
      // the Unseen event is not important for the
      // messaging-events-logs feature
      // a public servant only needs to know if
      // the message has been opened
      // at any point in time
      if (!params.body.isSeen) {
        return;
      }

      messagesReadCounter.add(1, { organizationId: params.organizationId });

      const eventLogger = new MessagingEventLogger(this.pool, this.logger);
      eventLogger.log(MessagingEventType.citizenSeenMessage, {
        messageId: params.body.messageId,
      });
      await eventLogger.commit();
    }
  }
}

/**
 * Backward-compatible wrapper (used by tests and callers that still pass a raw
 * pg {@link Pool}). Route handlers instead construct the service from `app.db`
 * (plus `app.pg.pool` for event logging) directly.
 */
export async function updateMessageAction(params: {
  loggedInUser: { userId: string; accessToken: string };
  body: PutMessageActionBody;
  pool: Pool;
  logger: FastifyBaseLogger;
}): Promise<void> {
  const service = new MessageActionService(
    createDbFromPool<DB>(params.pool),
    params.pool,
    params.logger,
  );
  return service.update({
    loggedInUser: params.loggedInUser,
    body: params.body,
  });
}
