import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";
import type { MessageList, ReadMessage } from "../types/messages.js";
import type { AcceptedQueryBooleanValues } from "../types/schemaDefinitions.js";

export interface InboxQuery {
  isSeen: AcceptedQueryBooleanValues | undefined;
  search: string | undefined;
  deletedAfterDateTime: string | undefined;
  tagId: string | undefined;
  untagged: boolean | undefined;
}

export interface InboxParams {
  recipientUserIds: string[];
  organizationId: string | undefined;
  pagination: { limit: string; offset: string };
  query: InboxQuery;
}

export interface DeletionRow {
  id: string;
  deletedAt: Date | null;
  recipientUserId: string;
}

/**
 * Data-access model for the `messages` domain. Extends the shared
 * {@link BaseModel} for generic CRUD and adds bespoke finders that reproduce the
 * hand-written SQL previously living in `message-service.ts` (the paginated
 * inbox read with `COUNT(*) OVER()`, the single-message read with aggregated
 * attachments, and the soft-delete / tag mutations).
 *
 * Query semantics are intentionally identical to the previous raw SQL so API
 * responses and behaviour stay unchanged.
 */
export class MessageModel extends BaseModel<DB, "messages"> {
  constructor(db: Kysely<DB>) {
    super(db, "messages");
  }

  /**
   * Paginated inbox read. Mirrors the previous `queryMessagesForList` SQL:
   * dynamic WHERE clauses, `COUNT(*) OVER()` for the total, a correlated
   * attachments count subquery, ordered by `scheduled_at DESC`.
   */
  async listForInbox(
    params: InboxParams,
  ): Promise<{ data: MessageList; totalCount: number }> {
    const { recipientUserIds, organizationId, pagination, query } = params;

    let builder = this.db
      .selectFrom("messages")
      .select((eb) => [
        "messages.id",
        "messages.subject",
        "messages.threadName as threadName",
        "messages.organisationId as organisationId",
        "messages.userId as recipientUserId",
        "messages.scheduledAt as createdAt",
        "messages.isSeen as isSeen",
        eb
          .selectFrom("attachmentsMessages")
          .select((sub) => sub.fn.countAll().as("c"))
          .whereRef("attachmentsMessages.messageId", "=", "messages.id")
          .as("attachmentsCount"),
      ])
      .select(sql<string>`count(*) over()`.as("count"));

    if (organizationId) {
      builder = builder.where("messages.organisationId", "=", organizationId);
    }

    builder = builder.where("messages.userId", "in", recipientUserIds);
    builder = builder.where(sql<boolean>`messages.scheduled_at <= now()`);

    if (query.deletedAfterDateTime) {
      builder = builder.where(
        "messages.deletedAt",
        ">=",
        new Date(query.deletedAfterDateTime),
      );
    } else {
      builder = builder.where("messages.deletedAt", "is", null);
    }

    if (query.isSeen !== undefined) {
      builder = builder.where(
        sql<boolean>`messages.is_seen = ${query.isSeen}::boolean`,
      );
    }

    builder = builder.where(
      "messages.subject",
      "ilike",
      query.search ? `%${query.search}%` : "%%",
    );

    if (query.untagged) {
      builder = builder.where("messages.tagId", "is", null);
    } else if (query.tagId) {
      builder = builder.where("messages.tagId", "=", query.tagId);
    }

    const rows = await builder
      .orderBy("messages.scheduledAt", "desc")
      .limit(Number(pagination.limit))
      .offset(Number(pagination.offset))
      .execute();

    const totalCount = rows.at(0)?.count
      ? Number(rows.at(0)?.count)
      : undefined;
    if (!totalCount) {
      return { data: [], totalCount: 0 };
    }

    const data: MessageList = rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      createdAt: row.createdAt as unknown as string,
      threadName: row.threadName,
      organisationId: row.organisationId,
      recipientUserId: row.recipientUserId,
      attachmentsCount: Number(row.attachmentsCount ?? 0),
      isSeen: Boolean(row.isSeen),
    }));

    return { data, totalCount };
  }

  /**
   * Single-message read with aggregated attachment ids. Mirrors the previous
   * `getMessage` SQL (LEFT JOIN + ARRAY_AGG FILTER + GROUP BY). Returns the raw
   * row (with `createdAt` still a Date) or `undefined` when not found; callers
   * apply the response/permission shaping.
   */
  async findByIdWithAttachments(params: {
    messageId: string;
    userId?: string;
    deleted?: boolean;
  }): Promise<ReadMessage | undefined> {
    let builder = this.db
      .selectFrom("messages")
      .leftJoin(
        "attachmentsMessages",
        "attachmentsMessages.messageId",
        "messages.id",
      )
      .select([
        "messages.subject as subject",
        "messages.excerpt as excerpt",
        "messages.plainText as plainText",
        "messages.richText as richText",
        "messages.createdAt as createdAt",
        "messages.threadName as threadName",
        "messages.organisationId as organisationId",
        "messages.userId as recipientUserId",
        "messages.isSeen as isSeen",
        "messages.securityLevel as security",
        "messages.externalId as externalId",
      ])
      .select(
        sql<
          string[]
        >`COALESCE(ARRAY_AGG(attachments_messages.attachment_id) FILTER (WHERE attachments_messages.attachment_id IS NOT NULL), '{}')`.as(
          "attachments",
        ),
      )
      .where("messages.id", "=", params.messageId)
      .where(sql<boolean>`messages.scheduled_at <= now()`);

    builder =
      params.deleted === true
        ? builder.where("messages.deletedAt", "is not", null)
        : builder.where("messages.deletedAt", "is", null);

    if (params.userId) {
      builder = builder.where("messages.userId", "=", params.userId);
    }

    const row = await builder
      .groupBy([
        "messages.subject",
        "messages.excerpt",
        "messages.plainText",
        "messages.richText",
        "messages.createdAt",
        "messages.threadName",
        "messages.organisationId",
        "messages.userId",
        "messages.isSeen",
        "messages.securityLevel",
        "messages.externalId",
      ])
      .orderBy("messages.createdAt", "desc")
      .executeTakeFirst();

    return row as ReadMessage | undefined;
  }

  /** Fetch id/deletedAt/recipientUserId for the given ids (delete validation). */
  async findForDeletion(ids: string[]): Promise<DeletionRow[]> {
    const rows = await this.db
      .selectFrom("messages")
      .select([
        "messages.id as id",
        "messages.deletedAt as deletedAt",
        "messages.userId as recipientUserId",
      ])
      .where("messages.id", "in", ids)
      .execute();
    return rows as DeletionRow[];
  }

  /** Soft-delete the given messages (sets deleted_at/updated_at to now()). */
  async softDeleteByIds(ids: string[]): Promise<void> {
    await this.db
      .updateTable("messages")
      .set({ deletedAt: sql<Date>`now()`, updatedAt: sql<Date>`now()` })
      .where("messages.id", "in", ids)
      .execute();
  }

  /** Fetch id/userId for the given ids (tag-assignment validation). */
  async findOwners(ids: string[]): Promise<{ id: string; userId: string }[]> {
    const rows = await this.db
      .selectFrom("messages")
      .select(["messages.id as id", "messages.userId as userId"])
      .where("messages.id", "in", ids)
      .execute();
    return rows as { id: string; userId: string }[];
  }

  /** Look up a tag by id, returning its id/userId owner. */
  async findTag(
    tagId: string,
  ): Promise<{ id: string; userId: string } | undefined> {
    const row = await this.db
      .selectFrom("tags")
      .select(["tags.id as id", "tags.userId as userId"])
      .where("tags.id", "=", tagId)
      .executeTakeFirst();
    return row as { id: string; userId: string } | undefined;
  }

  /** Set (or clear) the tag on the given messages. */
  async setTag(ids: string[], tagId: string | null): Promise<void> {
    await this.db
      .updateTable("messages")
      .set({ tagId })
      .where("messages.id", "in", ids)
      .execute();
  }
}
