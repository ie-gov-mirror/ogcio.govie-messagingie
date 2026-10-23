# send-message-batches

A CLI script that sends a batch messaging campaign to a list of recipients from a CSV file. The script is **idempotent** — re-running with the same inputs resumes from where it left off rather than starting over.

---

## How it works

Each invocation is identified by a **run fingerprint** derived from:
- `RECIPIENTS_CSV_PATH`
- `HTML_TEMPLATE_PATH` / `TXT_TEMPLATE_PATH`
- `MESSAGE_SUBJECT`
- `SEND_BATCH_SIZE`
- `sendAt` (resolved from `--send-at` or `SEND_AT_MODE=immediate`)

The script maintains its own dedicated Postgres database and runs three phases in sequence:

| Phase                       | What it does                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Resolve recipients**      | Looks up each email via the Profile API, checks eligibility (active + opted-in / pre-approved), creates one canonical pending message per resolved recipient |
| **Send messages**           | Renders TXT/HTML templates per recipient and sends via the Messaging API in configurable batches                                                             |
| **Sync delivery snapshots** | Polls the Messaging API for the latest event (delivered, failed, etc.) for each sent message                                                                 |

If the process is interrupted it can be restarted with the same arguments and will skip completed work.

---

## Prerequisites

- Node.js 20 + pnpm
- A Postgres instance reachable from the configured credentials
- Logto OIDC endpoint and a Public Servant OAuth client (`client_credentials` flow)

---

## Configuration

Copy `.env.sample` to `.env` and fill in every value:

```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB_NAME=messaging_send_message_batches

LOGTO_OIDC_ENDPOINT=https://<logto-host>/oidc/
PUBLIC_SERVANT_CLIENT_ID=<client-id>
PUBLIC_SERVANT_CLIENT_SECRET=<client-secret>
PUBLIC_SERVANT_ORGANIZATION_ID=<org-id>
PUBLIC_SERVANT_SCOPES=messaging:message:* profile:user:* messaging:event:read messaging:template:*

PROFILE_BACKEND_URL=https://<profile-api-host>
MESSAGING_BACKEND_URL=https://<messaging-api-host>

RECIPIENTS_CSV_PATH=/absolute/path/to/recipients.csv
HTML_TEMPLATE_PATH=/absolute/path/to/template.html
TXT_TEMPLATE_PATH=/absolute/path/to/template.txt

MESSAGE_SUBJECT=Your message subject

SEND_BATCH_SIZE=50        # number of messages to send per batch
SEND_BATCH_DELAY_MS=250   # milliseconds to wait between batches
EVENT_SYNC_DELAY_SECONDS=30  # minimum age of a sent message before its delivery event is fetched
```

---

## Recipients CSV

The CSV must have an `email` column (case-insensitive). Additional columns are ignored.

```csv
email,name
alice@example.com,Alice
bob@example.com,Bob
```

---

## Template variables

Only these two variables are supported in HTML and TXT templates:

| Variable         | Value                                        |
| ---------------- | -------------------------------------------- |
| `{{publicName}}` | Recipient's public name from the Profile API |
| `{{email}}`      | Recipient's email address from the CSV       |

Any other `{{…}}` placeholder causes the script to abort.

---

## Usage

### Run (default)

```bash
# from apps/messaging-api/
pnpm send-message-batches
# or explicitly
pnpm send-message-batches -- run
```

**Options:**

| Flag                             | Description                                                           |
| -------------------------------- | --------------------------------------------------------------------- |
| `--force-new`                    | Ignore any existing run with the same fingerprint and start a new one |
| `--send-at <iso-8601>`           | Schedule the send time (overrides the env-file value)                 |
| `--event-sync-delay-seconds <n>` | Override `EVENT_SYNC_DELAY_SECONDS` for this invocation               |

### Status

Check the state of the most recent run matching the current fingerprint:

```bash
pnpm send-message-batches -- status
```

Target a specific run by ID:

```bash
pnpm send-message-batches -- status --run-id <uuid>
```

### Pino logger variant

```bash
pnpm send-message-batches:pino
```

Outputs structured JSON logs instead of console output. Useful for production / log aggregation.

---

## Run lifecycle

```
created → resolving_recipients → ready_to_send → sending
       → ready_to_sync_delivery → syncing_delivery
       → completed | completed_with_failures | failed
```

A run that reaches `completed_with_failures` had at least one terminal send failure. Individual failures are recorded in the database; successful recipients are unaffected.

---

## Database

The script manages its own Postgres database (`POSTGRES_DB_NAME`) and runs local migrations automatically on startup. The main tables are:

| Table              | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `batch_runs`       | One row per run, tracks lifecycle status and fingerprint  |
| `batch_recipients` | One row per CSV row, tracks profile resolution status     |
| `batch_messages`   | One row per sent message, tracks send and delivery status |

---

## Operator output

The default console entrypoint is now optimized for human operators rather than raw lifecycle logs.

During `run`, it prints:
- Batch Run creation or resume context
- recipient-resolution summaries with grouped exclusions
- batch-level send progress
- delivery-sync summaries that distinguish "too new to sync" from "checked but still no snapshot"
- a final operator outcome that explains whether the Batch Run completed, completed with issues, is waiting on later delivery updates, or failed early

## Status output

The `status` command now prints a sectioned report instead of a flat counter dump.

Sections:
- operator headline
- attention needed
- progress snapshot
- delivery state
- next step
