# reproduce-export-leak

A one-shot operator task that reproduces (and later verifies the fix for) a
**cross-user data-export leak** in the _user data export_ feature.

## The bug it reproduces

The profile "export my data" lifecycle task builds a zip of the requesting
user's data. A buggy version scoped the exported **files** to _every_ file
shared with the user via the upload `files_users` table. Because a bad migration
cross-joined shares, users ended up with `files_users` rows for files that were
never theirs — so their export leaked other users' documents.

The fix scopes exported files to the user's **own message attachments**
(`attachments_messages`) instead of raw `files_users` shares.

This task recreates the exact precondition: it shares user2's file with user1
**without** attaching it to any message (a `files_users` row with no
`attachments_messages` row). On a buggy environment, user1's export then
contains user2's file; on a fixed environment, it does not.

> ⚠️ **SAFETY**
>
> - This task **mutates real data** (uploads files, sends messages, injects a
>   cross-user share). Run it against **dev/uat only** with **throwaway test
>   accounts**.
> - It **refuses to run** if `NODE_ENV=production`, or if `REPRO_ENV` / any
>   resolved host looks production-like (matches `/prod|prd/`).
> - Every mutating subcommand additionally requires an explicit `--yes`
>   (or `REPRO_CONFIRM=yes`).
> - Never point it at a live/production environment.

## Install & prerequisites

- Node.js 20 + pnpm (run from `apps/messaging-api`).
- Dep `pdf-lib` is declared in `apps/messaging-api/package.json`.
- M2M applications in the target environment with the scopes listed below.

## Configuration

All configuration is via environment variables (see `.env.sample` for the full
list of names). You can either export them in your shell or create a local
`.env` and run with `tsx --env-file`.

| Variable                                                                                                      | Required by                      | Purpose                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `REPRO_ENV`                                                                                                   | all (or use explicit URLs)       | `dev` or `uat`; maps to known hosts                                                            |
| `REPRO_UPLOAD_BASE_URL` / `REPRO_MESSAGING_BASE_URL` / `REPRO_PROFILE_BASE_URL` / `REPRO_LOGTO_OIDC_ENDPOINT` | all (alternative to `REPRO_ENV`) | explicit base URLs (take precedence)                                                           |
| `REPRO_ORGANIZATION_ID`                                                                                       | seed, cleanup                    | org id for org-scoped M2M tokens                                                               |
| `REPRO_MESSAGING_M2M_APP_ID` / `_SECRET`                                                                      | seed                             | scope `messaging:message:*`                                                                    |
| `REPRO_UPLOAD_M2M_APP_ID` / `_SECRET`                                                                         | seed, cleanup                    | scope `upload:file:*`                                                                          |
| `REPRO_PROFILE_M2M_APP_ID` / `_SECRET`                                                                        | seed, cleanup                    | scope `profile:user:read` (or `profile:user.admin:*` to resolve a recipient given as an email) |
| `REPRO_USER1`                                                                                                 | seed, cleanup                    | exporter / leak recipient (default: **andrea** — dev `86yzcekv9bte`, uat `ybogyi9hneb7`)       |
| `REPRO_USER2`                                                                                                 | seed                             | owner of the leaked file (default `e2e-cit-2`, i.e. `e2e_citizen_user_2`)                      |
| `REPRO_CONFIRM`                                                                                               | mutating cmds                    | set to `yes` instead of passing `--yes`                                                        |

Values containing `@` are resolved to a profileId via `profile.findProfile`
(which needs `profile:user.admin:*`); otherwise the value is used directly as a
profileId. The defaults are profile ids, so the happy path never calls
`findProfile` and the profile org token only needs `profile:user:read`.

### Recommended defaults (dev/uat)

The seed sends as the **first-testing** organization using the **M2M E2E
Tester** app in both dev and uat.

| Setting          | Value                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Organization     | `first-testing`                                                                                                                    |
| Sending app      | M2M E2E Tester — app id `treftr21fgbvsdjwlol9` (dev/uat/testing; local seed uses `qrtllp45fgbvsdjyasd5`)                           |
| Org token scopes | `messaging:message:*` `upload:file:*` `profile:user:read` (the E2E Tester also carries `profile:user.admin:*` and `upload:file:*`) |

A single E2E Tester app fills all three org-credential slots
(`REPRO_MESSAGING_M2M_*`, `REPRO_UPLOAD_M2M_*`, `REPRO_PROFILE_M2M_*`).

**Recipients.** user1 is the **exporter / leak recipient** — a real MyGovID
account (**andrea**) so the leak can be confirmed by logging into the citizen
portal and downloading a data export manually. user2 is the clean **owner** of
the leaked file.

| Role                                    | Account              | profileId      | email / login                                      | PPSN                 |
| --------------------------------------- | -------------------- | -------------- | -------------------------------------------------- | -------------------- |
| user1 (exporter / leak recipient) — dev | andrea               | `86yzcekv9bte` | `andrea.pregnolato+testdev@nearform.com` (MyGovID) | —                    |
| user1 (exporter / leak recipient) — uat | andrea               | `ybogyi9hneb7` | `andrea.pregnolato@pm.me` (MyGovID)                | —                    |
| user2 (owner of the leaked file)        | `e2e_citizen_user_2` | `e2e-cit-2`    | `e2e_citizen_2@user.com`                           | `E2E_CITIZEN_USER_2` |

**Why these accounts.** user1 (andrea) is a real MyGovID account (confirmed
active, not suspended, in dev and uat), so the exporter can log into the citizen
portal and verify the leak through the real UI. user2 (`e2e_citizen_user_2`) is
the only file-owner confirmed with **zero** pre-existing org associations or
files in dev and uat, so the only "someone else's file" that can appear in
user1's export is the one this script injects — a noise-free, faithful
reproduction. (user2 is a message recipient / org-less citizen whose profile is
associated to the sending org only on send.)

**Where to get the E2E Tester secret** (never commit it — use a placeholder in
`.env`):
- **dev**: profile repo Bruno env file
  `@ogcio/govie-services-profile/apps/profile-api/e2e/.env.dev`.
- **uat**: the UAT block in
  `@ogcio/govie-services-profile/apps/profile-api/e2e/.env`.
  Both expose a Basic token for app `treftr21fgbvsdjwlol9`.
- **in cluster**: AWS Secrets Manager `workloads/logto/<env>` property
  `SEEDER_M2M_E2E_TESTER_APP_SECRET`.

### Known environment hosts

| Env | upload                                   | messaging                                   | profile                                   | logto oidc                                        |
| --- | ---------------------------------------- | ------------------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| dev | `https://upload-api.dev.services.gov.ie` | `https://messaging-api.dev.services.gov.ie` | `https://profile-api.dev.services.gov.ie` | `https://authorization.dev.services.gov.ie/oidc/` |
| uat | `https://upload-api.uat.services.gov.ie` | `https://messaging-api.uat.services.gov.ie` | `https://profile-api.uat.services.gov.ie` | `https://authorization.uat.services.gov.ie/oidc/` |

## Usage

Run via the package script. Both forms below work — the CLI strips a single
leading `--`, so pnpm's script-shortcut quirk (which forwards `--` verbatim,
unlike `pnpm run … -- …`) no longer swallows the subcommand:

```bash
# from apps/messaging-api
pnpm reproduce-export-leak -- <seed|cleanup> [options]   # documented form
pnpm reproduce-export-leak <seed|cleanup> [options]      # also works
```

### `seed` — create the leak

Uploads two marker PDFs (`belongs-to-user1.pdf`, `belongs-to-user2.pdf`), sends
each user a legitimate message with their own attachment, then shares user2's
file with user1 **with no message** (the leak). Prints a summary with the file
ids and the exact injected share so you can record it for cleanup.

```bash
# dev
REPRO_ENV=dev \
REPRO_ORGANIZATION_ID=<org> \
REPRO_MESSAGING_M2M_APP_ID=<id> REPRO_MESSAGING_M2M_APP_SECRET=<secret> \
REPRO_UPLOAD_M2M_APP_ID=<id> REPRO_UPLOAD_M2M_APP_SECRET=<secret> \
REPRO_PROFILE_M2M_APP_ID=<id> REPRO_PROFILE_M2M_APP_SECRET=<secret> \
pnpm reproduce-export-leak -- seed --yes

# uat (same vars, REPRO_ENV=uat). Add --symmetric to also share fileA -> user2.
REPRO_ENV=uat ... pnpm reproduce-export-leak -- seed --yes --symmetric
```

Required scopes: `upload:file:*`, `messaging:message:*`, `profile:user:read`
(only needs `profile:user.admin:*` if a recipient is supplied as an email).

### Verify the leak — manual export via the citizen portal

Verification is manual: user1 (**andrea**) is a real MyGovID account, so the
leak is confirmed by logging into the citizen portal and downloading a data
export. After `seed`:
1. Log into the **citizen portal** for the target environment as **andrea**
   (dev `andrea.pregnolato+testdev@nearform.com`, uat `andrea.pregnolato@pm.me`)
   via MyGovID.
2. Request **"Download / Export my data"** and download the resulting zip.
3. Inspect the zip:
   - **Pre-fix (leak present):** it contains a `belongs-to-user2` PDF (user2's
     file — the leak) **in addition to** andrea's own `belongs-to-user1` PDF.
   - **Post-fix ([profile PR #757](https://github.com/ogcio/govie-services-profile/pull/757)
     deployed):** there is **no** `belongs-to-user2` PDF; andrea's own
     `belongs-to-user1` PDF is still present.

### `cleanup` — remove the injected share

Removes the leaked share via `upload.removeFileSharing(fileId, userId)` (the
underlying `DELETE /api/v1/permissions/` with `{fileId, userId}`). Pass the
`--file-id` / `--user-id` printed by `seed`. `--user-id` defaults to the resolved
user1. `--purge` additionally schedules deletion of the seeded file (removes it
for all users it was shared with); seeded messages are not deleted automatically.

```bash
# dev
REPRO_ENV=dev \
REPRO_ORGANIZATION_ID=<org> \
REPRO_UPLOAD_M2M_APP_ID=<id> REPRO_UPLOAD_M2M_APP_SECRET=<secret> \
REPRO_PROFILE_M2M_APP_ID=<id> REPRO_PROFILE_M2M_APP_SECRET=<secret> \
pnpm reproduce-export-leak -- cleanup --file-id <fileB-id> --user-id <user1-profileId> --yes

# uat (same, REPRO_ENV=uat). Add --purge to also delete the seeded file.
REPRO_ENV=uat ... pnpm reproduce-export-leak -- cleanup --file-id <fileB-id> --user-id <user1-profileId> --yes --purge
```

Required scopes: `upload:file:*` (and `profile:user.admin:*` if `--user-id` is
omitted and user1 is an email).

## End-to-end flow

```
seed --yes            # inject the leak, record fileB id + user1 profileId
# andrea logs into the citizen portal, exports his data, and confirms a
# belongs-to-user2 PDF is present (leak) alongside his own belongs-to-user1 PDF.
cleanup --file-id <fileB> --user-id <user1> --yes
# ...after the fix is deployed...
seed --yes
# andrea re-exports and confirms belongs-to-user2 is GONE (own file still present).
cleanup --file-id <fileB> --user-id <user1> --yes
```
