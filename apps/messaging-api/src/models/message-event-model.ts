import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";
import {
  EventKey,
  EventStatus,
  MessagingEventType,
} from "../services/messages/event-logger.js";
import type {
  GetMessageEvent,
  ListMessageEventsStatus,
  MessageEventList,
} from "../types/message-events.js";
import type { PaginationParams } from "../types/schemaDefinitions.js";

export interface ListEventsParams {
  pagination: Required<PaginationParams>;
  organizationId: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: ListMessageEventsStatus;
  messageId?: string;
  recipientId?: string;
}

/**
 * Build the (constant-derived) status filter fragment. The interpolated values
 * are enum constants, not user input, and match the previous raw-pg query.
 */
function statusFilter(status?: ListMessageEventsStatus) {
  switch (status) {
    case "delivered":
      return sql`
        AND mes.event_status=${EventStatus.SUCCESSFUL} 
        AND mes.event_type = ANY(ARRAY[${EventKey.EMAIL_DELIVERY}, ${EventKey.MESSAGE_DELIVERY}])
      `;
    case "failed":
      return sql`AND mes.event_status=${EventStatus.FAILED}`;
    case "opened":
      return sql`
        AND mes.event_status=${MessagingEventType.citizenSeenMessage.status}
        AND mes.event_type = ${MessagingEventType.citizenSeenMessage.key}
      `;
    case "scheduled":
      return sql`
        AND mes.event_status=${MessagingEventType.scheduleMessage.status} 
        AND mes.event_type = ${MessagingEventType.scheduleMessage.key}
      `;
    default:
      return sql``;
  }
}

/**
 * Data-access model for message events (spanning `message_event_summary` and
 * `messaging_event_logs`). Extends {@link BaseModel} for generic CRUD and ports
 * the aggregated summary list and event-log CTE reads previously living in
 * `message-event-service.ts`.
 *
 * These queries use JSON operators, date coalescing and dynamic status filters
 * that the query builder can't express cleanly, so they drop to the exported
 * `sql` template — kept identical to the previous raw-pg implementation. In
 * particular, `limit`/`offset` are passed straight through so Postgres still
 * rejects negative values (a behaviour the API relies on).
 */
export class MessageEventModel extends BaseModel<DB, "messageEventSummary"> {
  constructor(db: Kysely<DB>) {
    super(db, "messageEventSummary");
  }

  async listEvents(
    params: ListEventsParams,
  ): Promise<{ data: MessageEventList; totalCount: number }> {
    const {
      pagination,
      organizationId,
      search = "",
      dateFrom,
      dateTo,
      status,
      messageId,
      recipientId,
    } = params;

    const eventsStatusFilter = statusFilter(status);
    const searchLike = `%${search}%`;

    const messageIdFilter =
      messageId && messageId.length > 0
        ? sql`AND mes.message_id = ${messageId}`
        : sql``;
    const recipientFilter =
      recipientId && recipientId.length > 0
        ? sql`AND mes.data->>'receiverUserId' = ${recipientId}`
        : sql``;

    // Separate count query first
    const countQuery = await sql<{ count: number }>`
    SELECT COUNT(DISTINCT mes.message_id) as "count"
    FROM message_event_summary mes
    WHERE mes.organisation_id = ${organizationId} ${messageIdFilter} ${recipientFilter}
        ${eventsStatusFilter}
      AND (
        mes.subject ILIKE ${searchLike}
        OR mes.data->>'receiverFullName' ILIKE ${searchLike}
        OR mes.data->>'receiverPPSN' ILIKE ${searchLike}
      )
      AND mes.scheduled_at::DATE BETWEEN 
        COALESCE(${dateFrom ?? null}::DATE, (NOW() AT TIME ZONE 'UTC')::DATE - INTERVAL '30 days')
        AND COALESCE(${dateTo ?? null}::DATE, (NOW() AT TIME ZONE 'UTC')::DATE)
    `.execute(this.db);

    const totalCount = Number(countQuery.rows[0]?.count) || 0;
    if (totalCount === 0) {
      return { data: [], totalCount: 0 };
    }

    const result = await sql<{
      id: string;
      messageId: string;
      subject: string;
      receiverFullName: string;
      eventStatus: string;
      eventType: string;
      scheduledAt: Date;
    }>`
  SELECT
    mes.messaging_event_logs_id AS "id",
    mes.message_id AS "messageId",
    mes.subject,
    mes.event_status AS "eventStatus",
    mes.event_type AS "eventType",
    COALESCE(
      mes.data->>'receiverFullName',
      NULL
    ) AS "receiverFullName",
    mes.scheduled_at AS "scheduledAt"
  FROM message_event_summary mes
  WHERE mes.organisation_id = ${organizationId}
    ${messageIdFilter}
    ${recipientFilter}
    AND (
      mes.subject ILIKE ${searchLike}
      OR mes.data->>'receiverFullName' ILIKE ${searchLike}
      OR mes.data->>'receiverPPSN' ILIKE ${searchLike}
    )
    AND mes.scheduled_at::DATE BETWEEN 
        COALESCE(${dateFrom ?? null}::DATE, (NOW() AT TIME ZONE 'UTC')::DATE - INTERVAL '30 days')
        AND COALESCE(${dateTo ?? null}::DATE, (NOW() AT TIME ZONE 'UTC')::DATE)
    ${eventsStatusFilter}
  ORDER BY mes.updated_at DESC, mes.message_id
  LIMIT ${pagination.limit}
  OFFSET ${pagination.offset}
  `.execute(this.db);

    return {
      data: result.rows.map((row) => ({
        id: row.id,
        messageId: row.messageId,
        subject: row.subject,
        receiverFullName: row.receiverFullName,
        eventStatus: row.eventStatus,
        eventType: row.eventType,
        scheduledAt: row.scheduledAt.toISOString(),
      })),
      totalCount,
    };
  }

  /** Full event-log history for a single event id, scoped to the organisation. */
  async findEventById(
    eventId: string,
    organizationId: string,
  ): Promise<GetMessageEvent[]> {
    const { rows } = await sql<GetMessageEvent>`
      with message_id_cte as (
          select mel.message_id
          from messaging_event_logs mel
          join messages m on m.id = mel.message_id
          where mel.id = ${eventId} 
            and m.organisation_id = ${organizationId}
      )
      select
          mel.event_status as "eventStatus",
          mel.event_type as "eventType",
          mel.data,
          mel.created_at as "createdAt",
          mel.message_id as "messageId"
      from messaging_event_logs as mel
      where mel.message_id = (select message_id from message_id_cte)
      order by
          mel.created_at desc
        `.execute(this.db);

    return rows;
  }

  /** Full event-log history for a message id, scoped to the organisation. */
  async findEventsByMessageId(
    messageId: string,
    organizationId: string,
  ): Promise<GetMessageEvent[]> {
    const { rows } = await sql<GetMessageEvent>`
      with message_id_cte as (
          select mel.message_id
          from messaging_event_logs mel
          join messages m on m.id = mel.message_id
          where mel.message_id = ${messageId} 
            and m.organisation_id = ${organizationId}
          limit 1
      )
      select
          mel.event_status as "eventStatus",
          mel.event_type as "eventType",
          mel.data,
          mel.created_at as "createdAt",
          mel.message_id as "messageId"
      from messaging_event_logs as mel
      where mel.message_id = (select message_id from message_id_cte)
      order by
          mel.created_at desc
        `.execute(this.db);

    return rows;
  }
}
