import type { operations, paths } from "@ogcio/api-types/messaging"

/**
 * Typed api-client for the messaging domain: owns endpoint paths, SWR
 * query-keys and request bodies. Keys carry the `/messaging` gateway prefix (a
 * routing concern added here), which the OpenAPI spec's API-local paths omit.
 */

/** Gateway service prefix that routes to messaging-api. */
const GATEWAY_PREFIX = "/messaging"
/** Base messages collection path (no trailing slash — matches existing keys). */
const MESSAGES_PATH = `${GATEWAY_PREFIX}/api/v1/messages`

/**
 * Virtual folder ids used by the inbox UI. `inbox` maps to "untagged" messages
 * and `deleted` to the soft-delete view; any other id is a real tag id. Kept
 * here (rather than in a UI module) because the list query-scoping below is the
 * one place that must interpret them.
 */
export const INBOX_FOLDER_ID = "inbox"
export const DELETED_FOLDER_ID = "deleted"

// ---------------------------------------------------------------------------
// Generated DTOs (Layer 3). Re-exported so hooks/components import their types
// from the api-client rather than reaching into `@ogcio/api-types` directly.
// ---------------------------------------------------------------------------

type ListMessagesOk =
  operations["ListMessages"]["responses"][200]["content"]["application/json"]

/** A single row of the paginated inbox list response. */
export type MessageListItem = ListMessagesOk["data"][number]

/** Pagination metadata (links + totalCount) returned alongside the list. */
export type MessagesListMetadata = NonNullable<ListMessagesOk["metadata"]>

type GetMessageOk =
  operations["GetMessage"]["responses"][200]["content"]["application/json"]

/** The full message detail payload (the populated `anyOf` branch). */
export type MessageDetail = Extract<GetMessageOk["data"], { subject: string }>

/** Body for `DELETE /messaging/api/v1/messages` — `{ ids }`. */
export type DeleteMessagesBody = NonNullable<
  paths["/api/v1/messages/"]["delete"]["requestBody"]
>["content"]["application/json"]

/** Response for `DELETE /messaging/api/v1/messages` — echoes the deleted ids. */
export type DeleteMessagesResponse =
  paths["/api/v1/messages/"]["delete"]["responses"][200]["content"]["application/json"]

/** Body for `POST /messaging/api/v1/messages/tags` — assigns/removes a tag. */
export type AssignTagBody =
  operations["AssignTagToMessages"]["requestBody"]["content"]["application/json"]

/** Response for `POST /messaging/api/v1/messages/tags`. */
export type AssignTagResponse =
  operations["AssignTagToMessages"]["responses"][200]["content"]["application/json"]

/** Body for `PUT /messaging/api/v1/message-actions/{id}` — the seen marker. */
export type MarkMessageReadBody = NonNullable<
  paths["/api/v1/message-actions/{messageId}"]["put"]["requestBody"]
>["content"]["application/json"]

/** FE-facing inputs for the inbox list query. */
export interface MessagesListParams {
  search: string | null
  page: number
  pageSize: number
  /** UI status filter: `all` | `read` | `unread`. */
  status?: string
  /** Active folder: `null`/`inbox` = untagged, `deleted` = trash, else a tag id. */
  folderId?: string | null
}

/** Substring that uniquely identifies an inbox-list SWR key (query form). */
const LIST_KEY_MARKER = `${MESSAGES_PATH}?`

function listKey(params: MessagesListParams): string {
  const query = new URLSearchParams()
  query.set("limit", String(params.pageSize))
  query.set("offset", String((params.page - 1) * params.pageSize))

  if (params.status === "unread") {
    query.set("isSeen", "false")
  } else if (params.status === "read") {
    query.set("isSeen", "true")
  }

  if (params.search) {
    query.set("search", params.search)
  }

  // Folder scoping: Inbox shows only untagged messages, Deleted shows
  // soft-deleted messages, and a user folder filters by its tag id.
  if (!params.folderId || params.folderId === INBOX_FOLDER_ID) {
    query.set("untagged", "true")
  } else if (params.folderId === DELETED_FOLDER_ID) {
    query.set("deletedAfterDateTime", new Date(0).toISOString())
  } else {
    query.set("tagId", params.folderId)
  }

  return `${LIST_KEY_MARKER}${query.toString()}`
}

export const messagesApi = {
  INBOX_FOLDER_ID,
  DELETED_FOLDER_ID,

  /** SWR key for the paginated inbox list. */
  listKey,

  /** SWR key for the inbox unread-count probe (`limit=1` untagged/unseen). */
  unreadCountKey(): string {
    return listKey({
      search: null,
      page: 1,
      pageSize: 1,
      status: "unread",
      folderId: INBOX_FOLDER_ID,
    })
  },

  /** SWR key for the recent-messages dashboard panel (trailing slash form). */
  recentKey(limit: number): string {
    return `${MESSAGES_PATH}/?limit=${limit}`
  },

  /** SWR key for a single message's detail. */
  detailKey(id: string): string {
    return `${MESSAGES_PATH}/${id}`
  },

  /** Mutation path for soft-deleting messages. */
  deletePath(): string {
    return MESSAGES_PATH
  },

  /** Build the delete request body from a set of ids (de-duplicated). */
  deleteBody(ids: string[]): DeleteMessagesBody {
    return { ids: Array.from(new Set(ids)) }
  },

  /** Mutation path for assigning/removing a folder tag. */
  tagsPath(): string {
    return `${MESSAGES_PATH}/tags`
  },

  /**
   * Build the move body: a tag id moves the messages into that folder, `null`
   * removes the tag (back to the inbox). Ids are de-duplicated.
   */
  moveBody(ids: string[], folderId: string | null): AssignTagBody {
    return { tagId: folderId, messageIds: Array.from(new Set(ids)) }
  },

  /** Mutation path for the per-message seen marker. */
  markReadPath(id: string): string {
    return `${GATEWAY_PREFIX}/api/v1/message-actions/${id}`
  },

  /** Build the mark-as-read body for a message id. */
  markReadBody(id: string): MarkMessageReadBody {
    return { messageId: id, isSeen: true }
  },

  /**
   * True when an SWR cache key targets an inbox-list request. `useGatewayFetch`
   * keys by the gateway URL string, or by `[url, actorType]` when an actor type
   * is set, so both shapes are accepted.
   */
  isListKey(key: unknown): boolean {
    const url =
      typeof key === "string"
        ? key
        : Array.isArray(key) && typeof key[0] === "string"
          ? key[0]
          : ""
    return url.includes(LIST_KEY_MARKER)
  },
}
