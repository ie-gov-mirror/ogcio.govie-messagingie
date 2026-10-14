import type { operations } from "@ogcio/api-types/messaging"

type MessageListItem =
  operations["ListMessages"]["responses"][200]["content"]["application/json"]["data"][number]

type MessageDetail = Extract<
  operations["GetMessage"]["responses"][200]["content"]["application/json"]["data"],
  { subject: string }
>

/** The shared inbox message shape used across list, detail and mock flows. */
export interface Message
  extends MessageListItem,
    Partial<Omit<MessageDetail, keyof MessageListItem>> {
  /** Gateway metadata from messaging-public-api (includes journey submission link) */
  metadata?: {
    journey?: {
      submissionId: string
      journeyId?: string
    }
  } | null
}

/** Paginated inbox list envelope (`{ data, metadata }`) from `ListMessages`. */
export type PaginatedMessages =
  operations["ListMessages"]["responses"][200]["content"]["application/json"]

export interface MessageFilter {
  status: "all" | "read" | "unread"
  search?: string
  page: number
}

/** Localized string bag returned by the Journey-Builder external API. */
export interface LocalizedText {
  en: string
  ga?: string
}

/** Journey run status (`RunStatus` in the Journey-Builder schema). */
export type SubmissionStatus =
  | "initiated"
  | "submitted"
  | "processing"
  | "completed"
  | "cancelled"

/**
 * A user's Journey-Builder submission, as returned by
 * `GET /journey-builder/api/v1/external/user-submissions[/{id}]`.
 */
export interface Submission {
  id: string
  title: LocalizedText
  description: LocalizedText
  organizationId: string
  journeyId: string
  status: SubmissionStatus
  createdAt: string
  updatedAt: string
  submittedAt?: string
}
