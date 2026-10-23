# Incident Remediation Plan — Technical Tasks

**Authors:** Andrea Pregnolato
**Status:** Draft
**Date:** Aug 3, 2026

## 1. Executive Summary

Following the recent production incident, we identified two areas of intervention:
- **Fix the export feature** so that it returns only the data associated with a
  user's messages.
- **Sanitise the incorrect file–user associations** in the upload-api database.

The export fix is a code change that uses the message–attachment association as
the primary source of truth.

The data sanitisation is a one-off, carefully staged database operation that
reconstructs the correct file–user associations from the messaging-api database,
removes the invalid rows, and verifies the result. It runs during an announced
maintenance window, with a full backup taken beforehand so the operation is fully
reversible.

## 2. Remediation 1 — Export feature returns only message-associated data

**Change:** `ogcio/govie-services-profile#757`

### 2.1 Root cause

The lifecycle worker's "export my data" step built the export file set from
_every_ file shared to a user, via `upload.support.getSharedFilesForUser` — i.e.
all rows in `files_users`. That is the exact junction table polluted by the
digital-postbox migration cross-join (the same table targeted by Remediation 2),
so other users' attachments were zipped into an export.

### 2.2 The fix

The export now scopes files to the user's own **message attachments**, the
authoritative link (`attachments_messages.attachment_id` in messaging). The
messaging support search (`postMessagesSearch`) already returns `attachmentIds`
per message, so no new endpoints or cross-service DB access are needed. Downloads
still go through the existing `upload.support.getFiles({ fileIds, userId })` batch
endpoint, which enforces a per-id ACL check as defence-in-depth.

Concretely:
- Adds a pure extractor `getAttachmentFileIdsByUserId(messagesByUserId)` (dedupes
  per user, omits users with no attachments).
- Fetches messages first, then derives `fileIdsByUserId` from message
  `attachmentIds`; drops the `getSharedFileIdsForUsers` call and the
  `loading_files` audit step; adds `file_id_source: "message_attachments"` to the
  `zipped_files` audit metadata.
- Removes the now-dead `getSharedFileIdsForUsers`; `downloadAndZipFiles`
  untouched.
- Gives each temporary export archive a unique name (`profileId` + random id) so
  two worker pods can never collide on the same temp file.

### 2.3 Regression protection

A new test suite (`export-user-data-files.test.ts`) covers the extractor (dedupe,
per-user isolation, multi-message, zero-attachment and empty-input cases) and
includes a flow-level leak-guard regression test: a deliberately polluted
`getSharedFilesForUser` stub returns a marker file, and the test asserts the
export requests exactly the message-scoped ids, never the leaked one, and that
`getSharedFilesForUser` no longer drives file selection.

### 2.4 Delivery

Code change, delivered through the standard review and release process. Deployed
**before** the Remediation 2 clean-up, so newly served exports stop leaking while
the data is being corrected.

## 3. Remediation 2 — Sanitise file–user associations in upload-api

### 3.1 Context

The upload-api database holds a `files_users` table that currently contains
incorrect file–user associations, introduced by a cross-join in the
digital-postbox migration (see §2.1).

The messaging-api database holds an `attachments_messages` table containing the
association between attachments and messages; each message has a `user_id` (the
recipient). By design, the upload-api database has **no** reference to messages,
and the two services run on **separate** database instances. This separation is
intentional.

We can therefore use `attachments_messages` as the source of truth to reconstruct
the correct content of `files_users`. Because the two databases are separate, the
plan introduces a **temporary bridge** — a small staging table of valid
`(file, user)` pairs, exported from messaging and loaded into upload — purely for
the duration of the clean-up, and removes it afterwards.

> The temporary bridge is a **staging table**, not a temporary `message_id`
> column on `files_users`. A staging table works cleanly across two separate
> databases (a column would have to be populated from the _other_ database, which
> isn't directly possible) and avoids altering the live table's schema.

### 3.2 Procedure

| #   | Step                                                                                                      | Notes                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Back up `files_users` (and take the upload-api DB backup)                                                 | Before any intervention; enables full rollback                                                                                                       |
| 2   | Build the list of **valid** `(file, user)` pairs from messaging-api                                       | `attachments_messages` ⋈ `messages` → each attachment paired with its recipient — the source of truth                                                |
| 3   | Load that list into a **temporary staging table** in upload-api                                           | The temporary bridge to messages; separate DBs mean no live cross-DB join                                                                            |
| 4   | **Dry-run report** — list the invalid rows that would be removed                                          | Read-only; reviewed and signed off before any deletion                                                                                               |
| 5   | **Delete the first verification cohort: 4 users** (`verify_04.txt`)                                       | The affected population is frozen once and sliced into 3 files (`verify_04` / `verify_14` / `remaining`); delete this cohort first                   |
| 6   | **Analyze export** for the 4 users                                                                        | Trigger the data export on their behalf (export confirmation notification disabled) and check the exported files contain no leak; if clean, continue |
| 7   | **Delete the second verification cohort: 14 users** (`verify_14.txt`)                                     | The remaining known-affected users we saw export with leaks                                                                                          |
| 8   | **Analyze export** for the 14 users                                                                       | Same export check; only proceed once it is clean                                                                                                     |
| 9   | Delete the invalid rows for **everyone else** (`remaining.txt`), processed **internally in groups of 20** | One command (`run.sh --group 20`); a row is invalid if the file came from the migration but its `(file, user)` pair is not in the valid list         |
| 10  | Verify the result                                                                                         | Re-check files shared with multiple users (see §3.3)                                                                                                 |
| 11  | Drop the temporary staging table                                                                          | Restores the original schema and service separation                                                                                                  |

Steps 5–8 validate that the deployed read-time export fix (profile #757) still
prevents leaks for the known-affected users **before** the bulk cleanse: we
delete a small cohort (4 users), re-run + analyse their export, then a larger
cohort (14 users), and only proceed once neither export leaks. Step 9 then
deletes everyone else from a single `remaining.txt`, processed **internally in
groups of 20 users** (each group a small transaction with its own backup). Every
cohort and every group of 20 uses its own `RUN_ID` (the step-9 groups are keyed
`<run-id>-g0000`, `-g0001`, …) and is independently reversible via
`99_upload_rollback.sql`, so any slice can be rolled back without touching the
others.

Scope guards keep the operation narrow: only files that came from the migration
(identified by `external_id` and the migrated organisation) are ever touched, so
normal uploads and direct shares are left alone. The `external_id` predicate is a
**production-only** scope guard: production's migrated rows carry `external_id`,
but dev/uat never ran the digital-postbox migration, so `external_id` is always
NULL there and the filter is made optional (dropped in dev/uat via
`--no-external-id-filter`, where organisation + candidate + non-legit-pair
scoping still bound the deletion). Linked (parent-child) accounts are unaffected
— that access is derived at read time and stored nowhere in `files_users`, so it
cannot be removed. The two files deliberately created in dev/uat to reproduce the
incident are explicitly excluded.

### 3.3 Verification

After the deletion we re-check for files associated with multiple users. This can
be legitimate (e.g. the same PDF sent to several people) — such cases are backed
by multiple messages and are **retained automatically**, because each recipient
appears in the valid list. Any remaining occurrence that is _not_ backed by a
message is individually verified rather than automatically removed. Only once all
verifications are complete do we drop the temporary staging table (step 7).

### 3.4 Rollback

If any step produces unexpected results, we restore `files_users` from the backup
taken in step 1 (the removed rows are also kept in a dedicated backup table) and
reassess before retrying. The clean-up itself runs in small, committed batches and
can be safely interrupted and resumed.

## 4. Operational Requirements

- **Maintenance window.** The sanitisation runs while the upload service is not in
  use. Departments are notified of a maintenance period during which they should
  not use it.
- **Execution environment.** The procedure runs as a set of scripts on a pod with
  access to both required databases (upload-api and messaging-api). The scripts
  are kept out of the automatic migration path and are run manually — dry-run and
  sign-off first, deletion only after approval.
- **Promotion path.** The full sequence is run on the test environments (dev, then
  uat) first, and only then in production, where the read-only report and sign-off
  always precede the deletion step.
