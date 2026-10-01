import { getBuildingBlockSDK } from "@ogcio/building-blocks-sdk"
import type {
  MessageEventStatus,
  MessageEventType,
} from "@/utils/appliedFilter.types"

export type ConsentStatuses = {
  messaging?: unknown[] // Adjust this if you know the exact shape of messaging objects
  [key: string]: unknown // allow other consent types
}

export type ProfileData = {
  ppsn?: string
  email?: string
  phone?: string
  lastName?: string
  firstName?: string
  dateOfBirth?: string
  publicName?: string
  [key: string]: string | undefined // allow extra keys dynamically
}

export type ProfileQueryBase = {
  id: string
  public_name: string
  email: string
  primary_user_id: string
}

export type ProfileQueryRow = ProfileQueryBase & {
  safe_level: number
  created_at: string // ISO timestamp string
  updated_at: string // ISO timestamp string
  deleted_at: string | null
  preferred_language: string
  consent_statuses?: ConsentStatuses | null
  organisation_id?: string | null
  data: ProfileData
  status: string
}

export type MainProfile = {
  id: string
  primaryUserId: string
  firstName?: string
  lastName?: string
  email?: string
  ppsn?: string
  publicName?: string
  status: string
}

export const UserRelationStatuses = {
  Unlinked: "unlinked",
  Parent: "parent",
  Child: "child",
} as const

export type UserRelations = { userData: ProfileQueryBase } & (
  | { userIs: typeof UserRelationStatuses.Unlinked }
  | { userIs: typeof UserRelationStatuses.Parent; children: ProfileQueryBase[] }
  | { userIs: typeof UserRelationStatuses.Child; parent: ProfileQueryBase }
)

export type LinkProfileQueryRow = ProfileQueryBase & {
  // has_tree: boolean
  links: {
    id: string
    public_name: string
    email: string
    is_primary: boolean
  }[]
}

export type LinkProfile = {
  id: string
  name: string
  email: string
  isPrimary: boolean
  links: { id: string; name: string; email: string; isPrimary: boolean }[]
}

export type ProfileLinkParams =
  | { type: "email"; value: string }
  | { type: "id"; value: string }

export type LogtoUser = {
  id: string
  username: string
  primaryEmail: string
  primaryPhone: string
  name: string
  avatar: string | null
  customData: Record<string, unknown>
  identities: Record<
    "MyGovId (MyGovId connector)",
    {
      userId: string
      details: {
        id: string
        name: string
        email: string
        phone: string
        rawData: {
          aud: string
          exp: number
          iat: number
          iss: string
          nbf: number
          oid: string
          sub: string
          ver: string
          email: string
          mobile: string
          surname: string
          lastName: string
          BirthDate: string
          auth_time: number
          firstName: string
          givenName: string
          CustomerId: string
          LastJourney: string
          AlternateIds: string
          CorrelationId: string
          SMS2FAEnabled: boolean
          DSPOnlineLevel: string
          currentCulture: string
          PublicServiceNumber: string
          AcceptedPrivacyTerms: boolean
          DSPOnlineLevelStatic: string
          trustFrameworkPolicy: string
          AcceptedPrivacyTermsDateTime: number
          AcceptedPrivacyTermsVersionNumber: string
        }
      }
    }
  >
  lastSignInAt: number | null
  createdAt: number
  updatedAt: number
  profile: Record<string, unknown>
  applicationId: string
  isSuspended: boolean
  hasPassword: boolean
}

export type LogtoUserRole = {
  tenantId: string
  id: string
  name: string
  description: string
  type: string
  isDefault: boolean
}

export type FullProfile = ProfileQueryRow & {
  logtoUser?: LogtoUser
  logtoUserRoles: LogtoUserRole[]
}

export type NextSearchParams = Record<string, string | string[]>

export type WhereClause = {
  sql: string
  values: string[]
  currentIndex?: number
}

export type MessageQueryRow = {
  id: string
  scheduled_at: string
  subject: string
  organisation_id: string
  status: { type: MessageEventType; status: MessageEventStatus }[]
}

export type TableMessage = {
  id: string
  scheduledAt: string
  orgId: string
  messagingEventType: string
  messagingEventStatus?: MessageEventStatus
  emailEventType: string
  emailEventStatus?: MessageEventStatus
  subject: string
}

export type Success<T> = { success: true; value: T }
export type Failure = { success: false; error: Error; userMessage: string }
export type Result<T> = Success<T> | Failure
export type SessionUser = { name: string; email: string }

export type Consent = {
  id: string
  subject: string
  status: "undefined" | "pending" | "pre-approved" | "opted-out" | "opted-in"
  version: string
  cascadeReason: string
  createdAt: string
}

export type GetUserConsentDataResponse = Result<
  NonNullable<
    Awaited<
      ReturnType<
        Awaited<
          ReturnType<typeof getBuildingBlockSDK>["profile"]["support"]
        >["getLatestConsents"]
      >
    >["data"]
  >
>

export type UpdateUserConsentDataResponse = Result<
  NonNullable<
    Awaited<
      ReturnType<
        Awaited<
          ReturnType<typeof getBuildingBlockSDK>["profile"]["support"]
        >["submitConsents"]
      >
    >["data"]
  >
>

export type ExportTaskStatus = "pending" | "processing" | "completed" | "failed"

export type ExportTask = {
  id: string
  status: ExportTaskStatus
  metadata: { expiresAt?: string; uploadId?: string } | null
}
