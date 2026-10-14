import { httpErrors } from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "../../db/schema.js";
import { MessageEventModel } from "../../models/message-event-model.js";
import type {
  GetMessageEvent,
  ListMessageEventsStatus,
  MessageEventList,
} from "../../types/message-events.js";
import type { PaginationParams } from "../../types/schemaDefinitions.js";

/**
 * Business logic for the message-events domain. Composes
 * {@link MessageEventModel} for data access and keeps the not-found mapping
 * here, so route handlers stay thin controllers.
 */
export class MessageEventService {
  private readonly model: MessageEventModel;

  constructor(db: Kysely<DB>) {
    this.model = new MessageEventModel(db);
  }

  async list(params: {
    pagination: Required<PaginationParams>;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    organizationId: string;
    status?: ListMessageEventsStatus;
    messageId?: string;
    recipientId?: string;
  }): Promise<{ data: MessageEventList; totalCount: number }> {
    return this.model.listEvents(params);
  }

  async getEvent(params: {
    eventId: string;
    organizationId: string;
  }): Promise<GetMessageEvent[]> {
    const rows = await this.model.findEventById(
      params.eventId,
      params.organizationId,
    );

    if (!rows.length) {
      throw httpErrors.notFound("No message event found for the organization");
    }

    return rows;
  }

  async getEventsForMessageId(params: {
    messageId: string;
    organizationId: string;
  }): Promise<GetMessageEvent[]> {
    const rows = await this.model.findEventsByMessageId(
      params.messageId,
      params.organizationId,
    );

    if (!rows.length) {
      throw httpErrors.notFound("No message event found for the organization");
    }

    return rows;
  }
}

/**
 * Build a {@link MessageEventService} from a raw pg {@link Pool}. Used by the
 * backward-compatible function wrappers below (and by tests) that still pass a
 * pool; route handlers instead construct the service from `app.db` directly.
 */
const serviceFromPool = (pool: Pool): MessageEventService =>
  new MessageEventService(createDbFromPool<DB>(pool));

export async function listMessageEvents(params: {
  pagination: Required<PaginationParams>;
  pool: Pool;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  organizationId: string;
  status?: ListMessageEventsStatus;
  messageId?: string;
  recipientId?: string;
}): Promise<{ data: MessageEventList; totalCount: number }> {
  return serviceFromPool(params.pool).list({
    pagination: params.pagination,
    search: params.search,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    organizationId: params.organizationId,
    status: params.status,
    messageId: params.messageId,
    recipientId: params.recipientId,
  });
}

export async function getMessageEvent(params: {
  eventId: string;
  organizationId: string;
  pool: Pool;
}): Promise<GetMessageEvent[]> {
  return serviceFromPool(params.pool).getEvent({
    eventId: params.eventId,
    organizationId: params.organizationId,
  });
}

export async function getEventsForMessageId(params: {
  messageId: string;
  organizationId: string;
  pool: Pool;
}): Promise<GetMessageEvent[]> {
  return serviceFromPool(params.pool).getEventsForMessageId({
    messageId: params.messageId,
    organizationId: params.organizationId,
  });
}
