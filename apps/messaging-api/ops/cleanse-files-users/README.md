# Cleanse `files_users` — DP-migration CROSS JOIN fan-out

One-off, chunked `psql` cleanup that deletes the bad cross-user `files_users` rows
the digital-postbox migration's `CROSS JOIN` in `shareAttachments` created (it
inserted every file×user combo instead of `(file, recipient)` pairs, so users can
see files that were never theirs). Root-cause data cleanup; pairs with the
read-time export fix in profile **#757**.

> Non-technical summary: see [`OVERVIEW.md`](./OVERVIEW.md).

> [!WARNING]
> Operational scripts, kept out of any migrations dir so they never auto-run. Run
> manually, **dry-run first**, review, then delete. `04` is the only file that deletes.

## What is a BAD row

Candidate-based set difference. A `files_users(file_id, user_id)` row is deleted iff **all** hold:

| Predicate                                                          | Meaning                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files.external_id IS NOT NULL`                                    | migrated file (scope) — **prod-only**, gated by `REQUIRE_EXTERNAL_ID` (default `true`); dev/uat drop it via `--no-external-id-filter` since the migration never ran there |
| `files.organization_id = :MIGRATED_ORG`                            | migrated org (scope)                                                                                                                                                      |
| `file_id ∈ (SELECT DISTINCT file_id FROM cleanse_legit_file_user)` | candidate: the file is a message attachment                                                                                                                               |
| no matching row in `cleanse_legit_file_user`                       | `(file, user)` is not a legit message pair                                                                                                                                |
| `file_id NOT IN :EXCLUDE_FILE_IDS`                                 | skip the dev/uat repro-leak files                                                                                                                                         |

The **legit set** comes from the messaging DB (`attachments_messages ⋈ messages`,
step `01`): each attachment paired with its message **recipient**. (Senders are
not included — the buggy migration only ever inserted recipient rows, and senders
reach files via org ownership, not a `files_users` share.)

Deliberately **not** used: no `shared_at` window (fragile; `external_id`+org
already scope it), no `owner` guard (migration set `owner` to a constant M2M app
id — no recipient identity), no linked-profile handling (parent access is
read-time derived, creates no `files_users` row, so the cleanse can't remove it).

> [!IMPORTANT]
> Limitation: for a message-attachment file, only its message recipients
> count as legit. A legit _non-message_ `/permissions` share of such a file to a
> non-recipient would also be removed — accepted, because these files are shared
> only via messages. Non-message files are never candidates.

## Files (run in order)

| #   | File                                   | DB        | Writes                                                                                                                                      |
| --- | -------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `01_messaging_extract_legit_pairs.sql` | messaging | read-only → CSV on stdout                                                                                                                   |
| 02  | `02_upload_stage_and_backup.sql`       | upload    | creates staging/backup/`cleanse_bad_rows()`                                                                                                 |
| 03  | `03_upload_dry_run_report.sql`         | upload    | **read-only** report                                                                                                                        |
| 04  | `04_upload_cleanse_chunked.sql`        | upload    | **DELETES** (only one) — **user-scoped**: requires a non-empty `USER_IDS` batch; run in batches (e.g. 20 users), each with its own `RUN_ID` |
| 05  | `05_upload_validate.sql`               | upload    | read-only validation                                                                                                                        |
| 99  | `99_upload_rollback.sql`               | upload    | re-insert from backup by `run_id`                                                                                                           |

## Run it

One host/pod with `psql` to **both** RDS instances (separate DBs → no cross-DB
JOIN; legit pairs go via CSV into upload staging). Deploy profile **#757** first.
Find the org: `SELECT DISTINCT organization_id FROM files WHERE external_id IS NOT NULL;`

```bash
cd apps/messaging-api/ops/cleanse-files-users
export MESSAGING_DSN='postgres://…/messaging'
export UPLOAD_DSN='postgres://…/upload'

# dry run (01→02+load→03), stops before any delete (full scope, no --users):
./run.sh --org "<MIGRATED_ORG>" --run-id "<run-id>"
# ...review step 03 output, get sign-off...
# execute (…→04 chunked delete→05 validate) for ONE user batch (delete is
# user-scoped — --delete REQUIRES a non-empty --users/--users-file batch):
./run.sh --org "<MIGRATED_ORG>" --run-id "<run-id>-batch1" --users '{u1,u2,...}' --delete
# ...repeat per batch (each its own run-id); or read the batch from a file:
./run.sh --org "<MIGRATED_ORG>" --run-id "<run-id>-batch2" --users-file ./batch2.txt --delete
# rollback a batch if needed (use that batch's run-id):
psql "$UPLOAD_DSN" -v RUN_ID="<run-id>-batch1" -f 99_upload_rollback.sql

# dev/uat only: the migration never ran there so files.external_id is always
# NULL — drop that prod-only predicate to rehearse against org + candidate scoping:
./run.sh --org "<MIGRATED_ORG>" --run-id "<run-id>-batch1" --users '{u1,u2,...}' --no-external-id-filter --delete
```

`run.sh` flags: `--org`, `--run-id` (required); `--chunk` (default 5000), `--csv`,
`--report-csv`, `--exclude`, `--users '{id1,id2,...}'`, `--users-file PATH`,
`--no-external-id-filter`, `--group N`, `--delete`. `--delete` requires a non-empty
`--users`/`--users-file` batch (`--users` wins if both given); the dry-run may
run full-scope without it. `--group N` (N>0, with `--delete`) deletes the batch
in successive N-user windows, each keyed `<run-id>-gNNNN` (own backup/rollback);
`0` (default) = single call. `--no-external-id-filter` drops the **prod-only**
`external_id IS NOT NULL` predicate — use it in **dev/uat** (where the
digital-postbox migration never ran, so `external_id` is always NULL and the
default filter matches nothing); prod keeps it ON so behaviour is unchanged.
Passed to psql as `REQUIRE_EXTERNAL_ID` (default `true`). Env: `MESSAGING_DSN`,
`UPLOAD_DSN`, optional `CSV_PATH` (default `/tmp/cleanse_legit_file_user.csv`).

### Generating and running user batches

The delete (`04`) is user-scoped. Freeze the affected population once from the
full-scope dry-run, slice it into **three** files, and run **three** steps —
verify an export between each. `make-batches.sh` produces the three files
(`verify_04.txt` = first 4 users, `verify_14.txt` = next 14, `remaining.txt` =
everyone else); step 3 then deletes `remaining.txt` internally in groups of 20
(`run.sh --group 20`), so there is no pre-split pile of `batch_NN` files.

```bash
# 0) full-scope dry-run -> export the COMPLETE bad-pair list (PROD: keep the
#    external_id filter ON, i.e. do NOT pass --no-external-id-filter):
./run.sh --org "$ORG" --run-id survey --report-csv /tmp/bad_pairs.csv

# freeze + slice into the 3 files (all_affected.txt is the frozen master too)
./make-batches.sh --report-csv /tmp/bad_pairs.csv --out ./batches   # verify_04.txt, verify_14.txt, remaining.txt

# step 1: the 4, then MANUALLY trigger a data export and verify no leak
./run.sh --org "$ORG" --run-id cleanse-v4  --users-file ./batches/verify_04.txt --delete
# step 2: the 14, then MANUALLY verify again
./run.sh --org "$ORG" --run-id cleanse-v14 --users-file ./batches/verify_14.txt --delete
# step 3: everyone else, processed internally in groups of 20
./run.sh --org "$ORG" --run-id cleanse-rest --users-file ./batches/remaining.txt --group 20 --delete
```

Each step (and each step-3 window) is independently rollback-able by its
`--run-id`: the step-3 windows are `cleanse-rest-g0000`, `cleanse-rest-g0001`, …
In **dev/uat** add `--no-external-id-filter` to every `run.sh` above (the
migration never ran there, so `external_id` is always NULL). You may hand-edit
`verify_04.txt`/`verify_14.txt` to pick specific known-leak users instead of the
default first-N slice. The generated files hold **profile ids (PII) and must not
be committed**. The delete recomputes the bad set per chunk, so a user that ends
up in two runs is harmless — the second simply finds 0 rows for them.

No-helper fallback (slice the master by hand):

```bash
tail -n +2 /tmp/bad_pairs.csv | cut -d, -f2 | sort -u > /tmp/affected.txt
head -n 4 /tmp/affected.txt > verify_04.txt
tail -n +5 /tmp/affected.txt | head -n 14 > verify_14.txt
tail -n +19 /tmp/affected.txt > remaining.txt
```

### On the OpenShift `psql-rds-access` support pod

The RDS instances are VPC-private, so run this from inside the cluster on the
**`psql-upload-api`** support pod (`upload-api-k8s-apps` →
`support/psql-rds-access`, namespace `upload-api-<env>`). Its base form reaches
**only** the upload DB and has a read-only root filesystem; the dev overlay
carries a temporary patch (`upload-api-k8s-apps#79`) that mounts a writable
`/tmp` and adds `MSG_POSTGRES_*` env for the messaging DB, so one pod can drive
the whole flow. (Mirror that patch to the uat/prod overlays before running there.)

```bash
# 1) bring up the support pod for your env (from upload-api-k8s-apps):
cd support/psql-rds-access/overlays/non-prod-02/dev && oc apply -k .

# 2) the support pod only ships `psql`, so copy this ops/ dir onto its writable /tmp:
POD=$(oc get pod -l app.kubernetes.io/name=psql-upload-api -o name | head -1)
oc cp apps/messaging-api/ops/cleanse-files-users "${POD#pod/}:/tmp/cleanse"

# 3) exec in, then assemble both DSNs from the pod's env
#    (upload = POSTGRES_*, messaging = MSG_POSTGRES_*):
oc rsh "$POD"
cd /tmp/cleanse
export UPLOAD_DSN="host=$POSTGRES_HOST port=$POSTGRES_PORT user=$POSTGRES_USER dbname=$POSTGRES_DATABASE password=$POSTGRES_PASSWORD sslmode=require"
export MESSAGING_DSN="host=$MSG_POSTGRES_HOST port=$MSG_POSTGRES_PORT user=$MSG_POSTGRES_USER dbname=$MSG_POSTGRES_DATABASE password=$MSG_POSTGRES_PASSWORD sslmode=require"
# ...then run ./run.sh (dry run, then --delete) exactly as above.

# 4) when finished, tear the pod down locally (removes the temporary xdb patch too):
#    oc delete -k .   # from the same overlay dir
```

Prefer the per-file commands when you want to pause between 03 and 04:

```bash
ORG='<MIGRATED_ORG>'; RUN_ID='<run-id>-batch1'; CSV=/tmp/cleanse_legit_file_user.csv
USERS='{u1,u2,...}'   # the user_id batch to cleanse (required for 04; optional/all-scope for 03/05)
# In dev/uat add -v REQUIRE_EXTERNAL_ID=false to 03/04/05 (prod: omit it — default true).
psql "$MESSAGING_DSN" -X -q -f 01_messaging_extract_legit_pairs.sql > "$CSV"
psql "$UPLOAD_DSN" -v ON_ERROR_STOP=1 -f 02_upload_stage_and_backup.sql
psql "$UPLOAD_DSN" -v ON_ERROR_STOP=1 -c "\copy cleanse_legit_file_user (file_id, user_id) FROM '$CSV' WITH (FORMAT csv, HEADER true)"
psql "$UPLOAD_DSN" -v MIGRATED_ORG="$ORG" -f 03_upload_dry_run_report.sql   # review! (add -v USER_IDS="$USERS" to scope to the batch)
psql "$UPLOAD_DSN" -v MIGRATED_ORG="$ORG" -v RUN_ID="$RUN_ID" -v USER_IDS="$USERS" -f 04_upload_cleanse_chunked.sql   # USER_IDS required (non-empty)
psql "$UPLOAD_DSN" -v MIGRATED_ORG="$ORG" -v RUN_ID="$RUN_ID" -v USER_IDS="$USERS" -f 05_upload_validate.sql          # residual for THIS batch = 0
```

Gotchas: don't wrap `04` in a transaction (`-1`/`--single-transaction`) — it
commits per batch and needs autocommit. `\copy` can't interpolate `:'VAR'`, so
CSV paths are shell-driven. Required vars abort (`\quit`) if unset; every file
sets `ON_ERROR_STOP`.

## Safety

- `04` is **user-scoped**: it requires a non-empty `USER_IDS` batch and only
  deletes bad rows for those users, so the cleanse runs in small controlled
  batches (e.g. 20 users) interleaved with export-based verification. Each batch
  uses its own `RUN_ID` and is independently reversible via `99`. An empty batch
  is rejected (by both a psql guard and a SQL guard) so it can never delete all.
- `04` deletes in chunks (`:CHUNK`, default 5000): `COMMIT` per batch,
  `FOR UPDATE … SKIP LOCKED`, recomputes the bad set each batch
  (idempotent/resumable), backs up to `cleanse_files_users_backup` first.
- Promotion: **dev full → uat full → prod report-only (01→03) + sign-off → prod 04→05**.
  Never run 04 before reviewing 03.
- SQL only (no app/API calls). Keep `cleanse_files_users_backup` until confirmed
  good in prod (rollback source).
