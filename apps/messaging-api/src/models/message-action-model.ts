import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";

/**
 * Data-access model backing the `message-actions` domain (read-status
 * mutations). Extends {@link BaseModel} for generic CRUD and ports the
 * recipient lookup and the conditional read-status update (a CTE the query
 * builder can't express cleanly) previously living in
 * `message-action-service.ts`.
 */
export class MessageActionModel extends BaseModel<DB, "messages"> {
  constructor(db: Kysely<DB>) {
    super(db, "messages");
  }

  /**
   * Resolve the recipient user id and owning organisation of a non-deleted
   * message. The organisation id tags the `messages_read` metric.
   */
  async findRecipient(
    messageId: string,
  ): Promise<{ recipientUserId: string; organizationId: string } | undefined> {
    const { rows } = await sql<{
      recipientUserId: string;
      organizationId: string;
    }>`
    select user_id as "recipientUserId", organisation_id as "organizationId" from messages where id = ${messageId} AND deleted_at IS NULL
    `.execute(this.db);
    return rows.at(0);
  }

  /**
   * Set the read status of a message for a recipient, only when it actually
   * changes. Returns the number of affected rows (0 when the status already
   * matched or the message did not belong to the recipient).
   */
  async setReadStatus(params: {
    userId: string;
    messageId: string;
    isSeen: boolean;
  }): Promise<number> {
    // Please note: in the message_selection we removed the
    // clause for and is_delivered = true because the list API
    // is not filtering messages based on delivery status anymore.
    // Thus, a message can be marked as seen even if it was not
    // marked as delivered before
    const { rows } = await sql<{ isSeen: boolean; id: string }>`
    with message_selection as(
        select m.id from messages m
        where 
            m.user_id = ${params.userId}
            and m.id = ${params.messageId}
            and ${params.isSeen} != m.is_seen
            and m.deleted_at IS NULL
    )
    update messages set is_seen = ${params.isSeen}
    where id = any(select id from message_selection)
    returning is_seen as "isSeen", id
    `.execute(this.db);

    return rows.length;
  }
}
