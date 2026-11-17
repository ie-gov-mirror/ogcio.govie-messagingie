# Profile API Announcements Spec

## Purpose

This document defines the backend contract for post-update announcements used by MessagingIE. The backend is responsible for storing bilingual announcement content, returning published announcements for one application, and recording permanent acknowledgement when the user clicks `Got it`.

## Requirements captured in backend terms

- Announcements are application-scoped.
- Allowed application identifiers are `profile`, `dashboard`, and `messaging`.
- Each announcement must include `en` and `ga` translations.
- Each announcement must include a `publishDate` and is only visible once that time has passed.
- Support users can create, list, fetch, and toggle announcements under the support API prefix.
- Citizens can fetch paginated published announcements for a specific application, with optional `newOnly=true` filtering for unacknowledged rows.
- If a citizen profile has a `profile_details` row with `organisation_id = null`, announcements are only visible when they were published after the earliest such row was created.
- Citizens can acknowledge the full displayed set in one request.
- Temporary dismissal is handled in the frontend session only.

## Response envelope

- Every endpoint returns a top-level `data` property.
- Paginated list endpoints also return `metadata.totalCount` and `metadata.links` using the standard Profile API pagination envelope.
- Non-paginated endpoints do not add pagination metadata.

## Implemented endpoints

### Support

`POST /api/v1/support/announcements`

- Creates one announcement with mandatory `en` and `ga` translations.
- Request body includes `applicationId`, `isEnabled`, `publishDate`, and `translations`.
- `isEnabled` is parsed from the string-backed boolean enum accepted by the shared schema: `true`, `false`, `0`, or `1`.
- Returns `200` with `{ data: { id } }`.

`GET /api/v1/support/announcements`

- Returns paginated announcement metadata without translations.
- Supports optional `applicationId` and `isEnabled` filters.
- Supports the standard `limit` and `offset` pagination query parameters.
- `isEnabled` uses the same string-backed boolean enum as support create.
- Returns `{ data: Announcement[], metadata }`.

`GET /api/v1/support/announcements/:id`

- Returns the full announcement including translations.
- Returns `{ data: AnnouncementWithTranslations }`.

`PATCH /api/v1/support/announcements/:id`

- Explicitly sets `isEnabled` to `true` or `false`.
- Intended for release-time enablement without rewriting content.
- Accepts the same string-backed boolean enum values as support create.
- Returns the full announcement including translations.

### Citizen

`GET /api/v1/citizens/announcements?applicationId=<id>`

- Always paginated using the standard limit and offset rules, with limit constrained to `1..100`.
- Always filters to announcements where `isEnabled = true` and `publishDate <= now`.
- If only `applicationId` is provided, returns both acknowledged and unacknowledged announcements for that application.
- If `newOnly=true` is also provided, returns only unacknowledged announcements for the current user.
- `newOnly=true` uses per-announcement acknowledgement rows only. Acknowledging one newer announcement does not hide older published announcements unless those older announcements also have their own acknowledgement rows.
- If the current profile has one or more `profile_details` rows where `organisation_id = null`, only announcements with `publishDate` later than the earliest matching `created_at` are returned.
- If the current profile has no `profile_details` row where `organisation_id = null`, the endpoint falls back to the current published-announcements behavior.
- `newOnly` accepts `true`, `false`, `0`, or `1`.
- Sorts by `publishDate DESC`.
- Returns `{ data: AnnouncementWithTranslations[], metadata }`.

`POST /api/v1/citizens/announcements/acknowledgements`

- Accepts `applicationId` plus the array of displayed `announcementIds`.
- Records acknowledgement in one transaction.
- Persists acknowledgement per `(announcement_id, profile_id)` row. The contract is not "seen up to timestamp/id" and does not include a profile-level latest-acknowledged marker.
- Safe to retry because inserts are idempotent.
- Returns `201` with `{ data: { acknowledgedIds } }`.

## Data model

### `announcements`

- `id`
- `application_id`
- `is_enabled`
- `publish_date`
- `created_at`
- `created_by` nullable

### `announcement_translations`

- `announcement_id`
- `language` stored as text and validated in code as `en | ga`
- `title`
- `description`

### `announcement_acknowledgements`

- `announcement_id`
- `profile_id`
- `acknowledged_at`
- unique by announcement and profile

## Database indexes

### Explicit secondary indexes to add

- `idx_announcements_application_publish_date` on `(application_id, publish_date DESC)`
  Supports support listing when filtering by application and ordering newest first.
- `idx_announcements_application_publish_date_enabled` on `(application_id, publish_date DESC) WHERE is_enabled = true`
  Optimizes citizen reads because they always require enabled, already-published announcements.
- `idx_profile_details_profile_null_org_created_at` on `(profile_id, created_at) WHERE organisation_id IS NULL`
  Optimizes the earliest citizen-profile cutoff lookup used before listing announcements.
  The existing `is_latest`-oriented `profile_details` indexes are not sufficient for this path because the cutoff query does not filter on `is_latest` and needs rows ordered by `created_at ASC`.

### Indexes already provided by constraints

- `PRIMARY KEY (id)` on `announcements` covers get-by-id lookups.
- `UNIQUE (announcement_id, language)` on `announcement_translations` covers translation lookup by announcement.
- `UNIQUE (announcement_id, profile_id)` on `announcement_acknowledgements` covers idempotent acknowledgement inserts and the `newOnly=true` acknowledgement existence check.

### Not required in the first cut

- No standalone index on `language`.
- No extra standalone index on `announcement_id` for translations or acknowledgements, because the unique constraints already create usable indexes.
- No cross-application support-list index unless listing without `applicationId` becomes a real hot path.

## Behavioral rules

- An announcement is visible only when it is enabled and its `publishDate` is less than or equal to the current time.
- If three new announcements are published before the next visit, the fetch endpoint can return all three.
- If a citizen profile existed before an announcement was published, that announcement can be returned; announcements published before the first null-organisation `profile_details` row are hidden.
- With the default citizen fetch, acknowledged announcements are still returned.
- With `newOnly=true`, acknowledged announcements are excluded.
- With `newOnly=true`, acknowledgement is evaluated independently for each announcement; it is not a contiguous watermark over earlier timestamps or IDs.
- Introducing any profile-level latest-acknowledged field or timestamp would be a product and API contract change, not an internal read-path optimization.
- If a profile has no null-organisation `profile_details` row, citizen fetches fall back to the previously published-enabled announcement behavior.
- If no published announcements exist for the application, the fetch endpoint returns an empty array.
- If an announcement is disabled before acknowledgement, it stops appearing.
- Support list responses return metadata only; support get, support toggle, and citizen list include translations.

## Authorization

- Support endpoints reuse the existing support route conventions:
  - `Permissions.Platform.Read` or `Permissions.Platform.Write`
  - `ensureValidSupportUser()`
- Citizen endpoints use:
  - `Permissions.UserSelf.Read`
  - `Permissions.UserSelf.Write`
- Citizen list requires a resolved profile ID from the authenticated user.

## Validation rules

- `applicationId` is required on support create, citizen fetch, and citizen acknowledgement.
- `applicationId` is optional on support list.
- When provided, `applicationId` must be one of `profile`, `dashboard`, or `messaging`.
- `publishDate` is required on support create.
- Both `translations.en` and `translations.ga` are required on create.
- `title` and `description` are required in both languages and must be non-empty strings.
- Allowed languages are enforced in TypeBox schemas and service validation, not via a database check constraint.
- A citizen acknowledgement request must only contain announcement IDs that belong to the supplied application.
- Support create and toggle accept `isEnabled` as `true | false | 0 | 1`.
- Support list `isEnabled` and citizen list `newOnly` accept the same `true | false | 0 | 1` string-backed enum.

## Testing scope

### Support route coverage

- create success
- create validation failure when one language is missing
- create validation failure when `publishDate` is missing or invalid
- create validation failure when support auth requirements are not met
- list filtering by `applicationId`
- list filtering by `isEnabled`
- get single by id
- toggle enabled success
- unauthorized and forbidden support access

### Citizen route coverage

- fetch paginated published announcements for one application
- fetch with `newOnly=true`
- fetch applies the first citizen-profile cutoff when a null-organisation `profile_details` row exists
- fetch falls back when no null-organisation `profile_details` row exists
- fetch empty when nothing is published yet
- fetch excludes disabled and unpublished announcements
- acknowledge multiple announcement IDs in one request
- acknowledge is idempotent on retries
- reject announcement IDs from another application

### Service coverage

- translation persistence
- publish-date persistence
- enabled-state updates
- published query excludes future rows and sorts by `publishDate DESC`
- `newOnly=true` query excludes acknowledged rows
- acknowledgement inserts use one transaction
- seeded read/update tests use direct fixture insertion separate from create-path coverage

## Non-goals for this slice

- No backend state for `Remind me later`, close, or `Escape`.
- No edit endpoint beyond enabled toggling.
