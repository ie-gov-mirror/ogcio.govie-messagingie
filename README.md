# Gov-IE Services Messaging

pnpm monorepo consolidating the messaging platform's backend APIs and citizen/admin frontends for Gov-IE government services.

## Apps

| App (`apps/`) | Type | Port | Purpose |
|---|---|---|---|
| `messaging-api` | Fastify API | 8002 | Core messaging: messages, providers, templates, email/SMS delivery |
| `profile-api` | Fastify API | 8003 | Citizen profiles, consents, PII handling |
| `scheduler-api` | Fastify API | 8005 | Task queue: webhook callbacks scheduled/retried via Postgres polling |
| `upload-api` | Fastify API | 8008 | File uploads to S3 with ClamAV virus scanning |
| `citizen-portal` | Next.js | 4001 | Unified citizen portal (messages + profile + dashboard zones, one deploy) |
| `messaging-admin-next` | Next.js | 3022 | Public-servant admin frontend for messaging |
| `messaging-support` | Next.js | 1337 | Internal support/superadmin app |

## Packages

| Package (`packages/`) | Purpose |
|---|---|
| `citizen-shared` (`@citizen-portal/shared`) | Cross-zone helpers for citizen-portal: SAG provider, `useCrossZoneLink`, env schema, theme/i18n/faro/analytics |
| `blacklist-profiles` | Blacklisted profile data + loader used by profile-api |

## Prerequisites

- Node.js `>=24` (see `.nvmrc`)
- pnpm `11.10.0` (enforced; `npx only-allow pnpm`)
- Docker (for Postgres, Redis, MailDev, ClamAV, S3)

## Quick start

```bash
pnpm install
pnpm dev:setup      # init .env files, start Docker services, create + migrate every API DB
pnpm dev            # run all four APIs + citizen-portal + admin-next concurrently
pnpm dev:health     # check services are up
```

Docker services (via `docker-compose.yaml`):

```bash
pnpm db:up          # postgresql, redis, maildev (1080 UI), clamav, ministack (S3 :4566)
```

## Top-level commands

| Command | What it does |
|---|---|
| `pnpm dev` | messaging-api (:8002), profile-api (:8003), scheduler-api (:8005), upload-api (:8008), citizen-portal (:4001), admin-next (:3022) |
| `pnpm build` | `pnpm -r build` (all workspaces) |
| `pnpm test` | `pnpm -r test` (all workspaces) |
| `pnpm lint` / `pnpm format` | Biome across all workspaces |
| `pnpm db:prepare` | compose up + create + migrate all API DBs + sync event summary + seed consent statements |
| `pnpm db:reset` | reset all API DBs (with confirmation) |
| `pnpm env:init` / `pnpm env:update` | create / sync `.env` files from `.env.sample` |

Per-app variants exist (e.g. `pnpm dev:api`, `pnpm dev:api:upload`, `pnpm build:admin-next`). Run every API on its own with `pnpm dev:apis`, or run an app directly with a filter: `pnpm --filter <app> <script>`.

`pnpm dev` covers the surfaces under active development. The app outside that set has its own script: `pnpm dev:support` (superadmin, :1337).

## Documentation

- [`scripts/README.md`](./scripts/README.md) — dev/DB/env helper scripts
- [`docs/internal/testing.md`](./docs/internal/testing.md) — citizen-portal test layers
- [`docs/internal/`](./docs/internal/) — feature flags, trunk-based flow, observability
- [`docs/wiki/`](./docs/wiki/) — docs mirrored to the programme wiki (metrics coverage)
- Each app has its own `README.md` with getting-started + testing.
