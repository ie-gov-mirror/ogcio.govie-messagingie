# Preflight: `attachments_messages` duplicate check (AB#41240 / PR #781)

Read-only verification to run **before** applying migration
`028.do.dedupe-attachments-messages.sql`. It tells you, up front, whether any
duplicate `(message_id, attachment_id)` rows exist and **exactly how many rows**
the dedupe `DELETE` will remove — so you can confirm the blast radius "before
doing damage".

## Why this lives here (not in `src/migrations/sql/`)

Postgrator's migration glob is `src/migrations/sql/*` (see
`src/migrations/scripts/migrate.ts`). Anything placed there is a candidate to be
executed as a migration. This file must **never** run as a migration, so it
lives under `ops/` instead, which Postgrator does not scan.

## What it checks

`verify.sql` prints, with `\echo` section headers:
1. Total rows in `attachments_messages`.
2. Distinct `(message_id, attachment_id)` pairs.
3. Number of duplicate **groups** (pairs with `count > 1`).
4. Rows that would be **removed** by `028`, computed two independent ways that
   must be equal:
   - `total rows − distinct pairs` (set arithmetic), and
   - the exact predicate of the `028` `DELETE` (`a.id > b.id`, i.e. keep the
     lowest `id` per pair).
     The printed `delta_should_be_zero` proves the number is identical to what the
     migration deletes.
5. The max duplication factor and a sample of the top 20 offending pairs.
6. A **verdict**: whether `UNIQUE (message_id, attachment_id)` would currently be
   violated — i.e. whether `028` is actually needed.

It is **read-only**: SELECTs only, no `INSERT/UPDATE/DELETE/DDL`, no transaction
required.

## How to run

Point `psql` at the messaging DB and run the file in a single session:

```bash
psql "$MESSAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/messaging-api/ops/preflight-attachments-messages-dupes/verify.sql
```

(Any read-only connection string works; a read replica is fine.)

## Interpreting the verdict (section 6)

- `constraint_would_be_violated = true` → duplicates exist. Run `028` (dedupe)
  before `029` (`CREATE UNIQUE INDEX CONCURRENTLY`) and `030` (attach
  constraint); otherwise the unique index build would fail on the raw data.
  `rows_removed_keeper_logic` is exactly how many rows `028` will delete.
- `constraint_would_be_violated = false` → the table is already clean. `028` is
  a harmless no-op and `029`/`030` are safe to apply directly.
