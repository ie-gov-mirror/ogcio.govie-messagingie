import type { operations } from "@ogcio/api-types/profile"

/**
 * Typed api-client for the profile domain: owns endpoint paths and re-exports
 * the generated DTOs. Paths carry the `/profile` gateway prefix (a routing
 * concern added here), which the OpenAPI spec's API-local paths omit. Mirrors
 * `src/api/messages.ts`.
 */

/** Gateway service prefix that routes to profile-api. */
const GATEWAY_PREFIX = "/profile"
/** Base profiles collection path. */
const PROFILES_PATH = `${GATEWAY_PREFIX}/api/v1/profiles`
/** Lifecycle-tasks collection path. */
const LIFECYCLE_TASKS_PATH = `${GATEWAY_PREFIX}/api/v1/lifecycle-tasks`
/** Organisations collection path. */
const ORGANISATIONS_PATH = `${GATEWAY_PREFIX}/api/v1/organisations`

// ---------------------------------------------------------------------------
// Generated DTOs (Layer 3). Re-exported so hooks/components import their types
// from the api-client rather than reaching into `@ogcio/api-types` directly.
// ---------------------------------------------------------------------------

type GetProfileOk =
  operations["getProfile"]["responses"][200]["content"]["application/json"]

/** Full profile payload returned by `GET /profile/api/v1/profiles/{id}`. */
export type Profile = GetProfileOk["data"]

/** Nested identity details block (`firstName`, `lastName`, `ppsn`, …). */
export type ProfileDetails = NonNullable<Profile["details"]>

/** Per-subject consent status map (keyed by subject, e.g. `messaging`). */
export type ConsentStatuses = NonNullable<Profile["consentStatuses"]>

type GetLifecycleTasksOk =
  operations["getLifecycleTasks"]["responses"][200]["content"]["application/json"]

/** A single lifecycle task (export/delete) row. */
export type LifecycleTask = GetLifecycleTasksOk["data"]["tasks"][number]

type GetOrganisationOk =
  operations["getOrganisation"]["responses"][200]["content"]["application/json"]

/** Organisation lookup payload (id + localized name translations). */
export type Organisation = GetOrganisationOk["data"]

export const profileApi = {
  /**
   * SWR/mutation key for a single profile. `consentSubjects` (comma-separated)
   * requests the per-subject consent status block.
   */
  detailKey(userId: string, opts?: { consentSubjects?: string }): string {
    const base = `${PROFILES_PATH}/${userId}`
    return opts?.consentSubjects
      ? `${base}?consentSubjects=${opts.consentSubjects}`
      : base
  },

  /** Mutation path for patching a profile (e.g. account linking, public name). */
  patchPath(userId: string): string {
    return `${PROFILES_PATH}/${userId}`
  },

  /** Mutation path for creating a lifecycle task. */
  lifecycleTasksPath(): string {
    return LIFECYCLE_TASKS_PATH
  },

  /** Mutation path for searching lifecycle tasks. */
  lifecycleTasksSearchPath(): string {
    return `${LIFECYCLE_TASKS_PATH}/search`
  },

  /** SWR key for a single organisation's localized name lookup. */
  organisationKey(organisationId: string): string {
    return `${ORGANISATIONS_PATH}/${organisationId}`
  },
}
