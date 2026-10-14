# Scripts

Developer-experience scripts for the monorepo. Run them from the repo root via the `pnpm` wrappers in the root `package.json`.

```
scripts/
├── dev/                  # setup.mjs, health-check.mjs, pipeline-local.mjs, azure-pipeline-local.mjs, ...
├── db/                   # reset.mjs
├── wiki/                 # pull.mjs, sync.mjs, paths.mjs, page-names.mjs — ADO wiki <-> docs/wiki/ sync tooling
├── init-env.mjs          # .env init/update/sync
└── smart-workspace-update.ts
```

## Environment setup

| Command | What it does |
|---|---|
| `pnpm dev:setup` | Validate prereqs (Node >=24, pnpm, Docker), init `.env`s, install deps, start the Docker services (postgres, maildev, redis, clamav, S3 — auxiliary ones even when Postgres already runs natively), create + migrate the DB of every API (messaging, upload, scheduler, profile) |
| `pnpm dev:health` | Check DB, every API's `/health` (messaging, profile, scheduler, upload), frontends, MailDev, ports |
| `pnpm dev:reset` | `clean` then re-run `dev:setup` |

## Env files

| Command | What it does |
|---|---|
| `pnpm env:init` | Create missing `.env` from `.env.sample` (skips existing) |
| `pnpm env:update` / `pnpm env:sync` | Add missing keys, drop obsolete ones, preserve values |
| `pnpm env:dry-run` | Preview changes without writing |

## Database

| Command | What it does |
|---|---|
| `pnpm db:up` | Start Docker services (postgres, redis, maildev, clamav, S3) |
| `pnpm db:create` | Create the DB of every API (`db:create:<app>` for a single one) |
| `pnpm db:migrate` | Migrate the DB of every API (`db:migrate:<app>` for a single one) |
| `pnpm db:prepare` | compose up + create + migrate all APIs + sync event summary + seed consent statements |
| `pnpm db:reset` | Drop/create/migrate all API DBs + post-migrate steps (add `--force` to skip prompt) |
| `pnpm seed:local-logto` | Re-seed the local Logto container (citizen-portal local-auth stack) with `*.local.test:8080` redirect URIs |

## Pipeline (local CI parity)

| Command | What it does |
|---|---|
| `pnpm pipeline:local` | Run pipeline steps locally (`--skip-tests`, `--skip-docker`, `--continue`) |
| `pnpm azure:local` | Azure pipeline helper (`--analyze`, `--setup-agent`, `--github`, `--manual`) |
| `pnpm deps:smart-update` | Smart workspace dependency update (see `SMART-UPDATE-README.md`) |

## Common config env vars

Read from app `.env` files (root `.env` for shared values), with sensible defaults:

- DB: `POSTGRES_HOST`, `POSTGRES_PORT` (5432), `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB_NAME`
- Ports: messaging-api 8002, profile-api 8003, scheduler-api 8005, upload-api 8008; MailDev UI 1080

## Wiki docs

| Command | What it does |
|---|---|
| `pnpm wiki:pull` | Overwrite `docs/wiki/` (and `GLOSSARY.md`) with the current ADO wiki subtree, so `git diff` shows the delta. `--repo`, `--subtree`, `--root` override the ADO coordinates / target path / repo root (env vars `WIKI_GIT_URL`, `WIKI_DOCS_SUBTREE`, `ADO_ORG`, `ADO_PROJECT`, `WIKI_NAME`, `ADO_BASE_URL`, `ADO_PAT` also work; sensible defaults match the pipeline) |
| `pnpm wiki:sync` | Push `docs/wiki/` (+ `GLOSSARY.md`) into the ADO wiki subtree verbatim, as one commit recording the source SHA. Refuses to overwrite a wiki-side edit since the last sync (a Sync conflict — resolve with `wiki:pull`); `--bootstrap` is required for the very first sync. Same `--repo`/`--subtree`/`--root`/env vars as `wiki:pull`, plus `--source-sha` |
| `pnpm wiki:check` | Validate `docs/wiki/` filenames against [ADO wiki page-file rules](https://learn.microsoft.com/azure/devops/project/wiki/wiki-file-structure) (no spaces, no `\` `#`, no leading/trailing `.`, `:` `<` `>` `*` `?` `\|` `"` percent-encoded, path ≤ 235 chars, page ≤ 18 MB). Runs in `pre-commit`, in the `Validate` stage of `pipeline-wiki-sync.yml` on every PR touching `docs/wiki`/`GLOSSARY.md`/`scripts/wiki`, and again inside `wiki:sync` before any network call |
| `pnpm test:wiki` | E2E tests for `wiki:pull` and `wiki:sync` against a local bare git repo (no network, no install needed). Runs in the `Validate` stage of `pipeline-wiki-sync.yml`, which gates the sync stage — a red suite blocks publishing |

## Troubleshooting

```bash
pnpm dev:health            # what's up / down
pnpm db:up                 # (re)start docker services
docker ps | grep postgres  # is the DB running?
lsof -i :8002              # who holds a port
pnpm dev:reset             # nuke + re-setup
```
