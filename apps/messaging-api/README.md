# Gov-IE MessagingIE API (Fastify)

Fastify-based API for the Gov-IE MessagingIE service. Provides health checks, OpenAPI docs, message operations and integrations (Logto, analytics, email/SMS providers, feature flags).

## Quick Start

- From the repo root:
  - `pnpm dev:setup` – initialize env and prepare database
  - `pnpm dev:api` – start the API on `http://localhost:8002`

Or inside this folder:

- `pnpm dev` – run with `tsx` and watch mode
- `pnpm build` – compile to `dist/`
- `pnpm start` – run compiled server

## Endpoints

- Health: `GET /health`
- Swagger UI: `GET /docs`
- OpenAPI file is also written to `./openapi-definition.yml` at startup
- API routes are mounted under `/api/v1`

## Environment

Copy `.env.sample` to `.env`. Important variables:

- Database: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB_NAME`
- External services: `PROFILE_BACKEND_URL`, `UPLOAD_BACKEND_URL`, `SCHEDULER_BACKEND_URL`
- Auth (Logto): `LOGTO_*` variables including resource indicators and M2M app IDs/secrets
- Email provider (SMTP): `EMAIL_PROVIDER_SMTP_*`
- SMS (SNS): `SNS_REGION`, `SNS_SENDER_ID`, `SNS_THROTTLE_TIME_MS`, `SNS_ALLOWED_ORGANIZATIONS`
- Feature flags: `FEATURE_FLAGS_URL`, `FEATURE_FLAGS_TOKEN`
- Observability/analytics: `OTEL_*`, `ANALYTICS_*`

Notes:

- The server listens on port `8002` (configured in code).
- Use the root scripts to spin up a local PostgreSQL and MailDev via Docker.

## Database Tasks

From repo root (recommended):

- Prepare DB: `pnpm db:prepare` (compose up + create + migrate + sync)
- Reset DB (with confirmation): `pnpm db:reset`

From this folder:

- `pnpm db:create` / `pnpm db:migrate` / `pnpm db:drop`
- `pnpm sync-event-summary` (with `:full-resync` option)

## Docker

From repo root:

- Build base image: `pnpm docker:build:base` (uses `Dockerfile`)
- Build MessagingIE API image: `pnpm docker:build:api` (uses `apps/messaging-api/Dockerfile`)
- Run: `docker run -p 8002:8002 messaging-api`

Run (use your local `.env`):

```bash
docker run -p 8002:8002 --env-file apps/messaging-api/.env messaging-api:latest
```

## Testing

```bash
pnpm --filter messaging-api test         # vitest + coverage (junit output)
pnpm --filter messaging-api test:local   # watch mode
pnpm --filter messaging-api test:e2e     # bruno e2e (local env)
```

## Troubleshooting

- `pnpm dev:health` from the repo root checks DB, API health, and other services
- Ensure PostgreSQL is reachable (compose or local instance)
- Use `LOG_LEVEL=debug` in `.env` for verbose logs

## Useful Links

- [Root README](../../README.md) - Setup and workspace scripts
- [Scripts Documentation](../../scripts/README.md) - Developer experience scripts
