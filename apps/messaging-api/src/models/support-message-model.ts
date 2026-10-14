import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";
import type {
  SupportMessageItem,
  SupportMessageList,
} from "../types/messages-support.js";
import type { PaginationParams } from "../types/schemaDefinitions.js";

/**
 * Data-access model for the support-messages read endpoint. Extends
 * {@link BaseModel} over the `messages` table and ports the paginated support
 * list (a `LEFT JOIN` + `json_agg` aggregate the query builder can't express
 * cleanly) previously living in `support-service.ts`, keeping the SQL identical
 * to the raw-pg implementation.
 */
export class SupportMessageModel extends BaseModel<DB, "messages"> {
  constructor(db: Kysely<DB>) {
    super(db, "messages");
  }

  async listForRecipients(params: {
    recipientUserIds: string[];
    pagination: Required<PaginationParams>;
    deletedAfterDateTime?: string;
  }): Promise<{ data: SupportMessageList; totalCount: number }> {
    const { recipientUserIds, pagination, deletedAfterDateTime } = params;

    const hasDeletedAfter =
      deletedAfterDateTime !== undefined && Date.parse(deletedAfterDateTime);

    const deletedAtClause = hasDeletedAfter
      ? sql`AND m.deleted_at >= ${deletedAfterDateTime}`
      : sql`AND m.deleted_at IS NULL`;
    const deletedAtClauseNoAlias = hasDeletedAfter
      ? sql`AND deleted_at >= ${deletedAfterDateTime}`
      : sql`AND deleted_at IS NULL`;

    const countQueryResult = await sql<{ count: string }>`
    SELECT COUNT(*) as count
    FROM messages 
    WHERE user_id = ANY (${recipientUserIds})
    AND scheduled_at <= now()
    ${deletedAtClauseNoAlias};
  `.execute(this.db);

    if (countQueryResult.rows.length === 0) {
      throw new Error("Count query did not return any rows");
    }
    const totalCount = Number(countQueryResult.rows[0].count);

    if (totalCount === 0) {
      return { data: [], totalCount: 0 };
    }

    const dataQueryResult = await sql<SupportMessageItem>`
    SELECT
      m.id,
      m.organisation_id AS "organisationId",
      m.user_id AS "recipientUserId",
      m.thread_name AS "threadName",
      m.is_seen AS "isSeen",
      m.subject AS "subject",
      m.rich_text AS "richText",
      m.plain_text AS "plainText",
      m.created_at AS "createdAt",
      m.scheduled_at AS "scheduledAt",
      json_agg(am.attachment_id) FILTER (WHERE am.attachment_id IS NOT NULL) AS "attachmentIds"
    FROM messages m
    LEFT JOIN attachments_messages am
      ON m.id = am.message_id
    WHERE m.user_id = ANY (${recipientUserIds}::text[])
      AND m.scheduled_at <= now()
      ${deletedAtClause}
    GROUP BY m.id
    ORDER BY m.user_id, m.created_at DESC
    LIMIT ${pagination.limit}
    OFFSET ${pagination.offset};
    `.execute(this.db);

    return { data: dataQueryResult.rows, totalCount };
  }
}
