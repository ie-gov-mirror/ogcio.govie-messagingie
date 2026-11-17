# Gov-IE Profile API (Fastify)

Fastify-based API for the Gov-IE Profile service. Provides health checks, OpenAPI docs, profile operations and integrations (Logto, analytics, feature flags).

## Quick Start

- From the repo root:
  - `pnpm dev:setup` – initialize env and prepare database
  - `pnpm --filter @govie-services/profile-api dev` – start the API on `http://localhost:8003`

Or inside this folder:

- `pnpm dev` – run with `tsx` and watch mode
- `pnpm build` – compile to `dist/`
- `pnpm start` – run compiled server

## Endpoints

- Liveness: `GET /health` - dependency-free, returns package/version metadata
- Readiness: `GET /health/ready` - checks database readiness and returns `{ "db": true }` on success
- Swagger UI: `GET /docs`
- OpenAPI file is also written to `./openapi-definition.yml` at startup
- API routes are mounted under `/api/v1`

## Environment

Copy `.env.sample` to `.env`. Important variables:

- Database: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB_NAME`
- External services: `PROFILE_BACKEND_URL`, `UPLOAD_BACKEND_URL`, `SCHEDULER_BACKEND_URL`
- Auth (Logto): `LOGTO_*` variables including resource indicators and M2M app IDs/secrets
- Feature flags: `FEATURE_FLAGS_URL`, `FEATURE_FLAGS_TOKEN`
- Observability/analytics: `OTEL_*`, `ANALYTICS_*`

Notes:

- The server listens on port `8003` (configured in code).
- Use the root scripts to spin up a local PostgreSQL via Docker.

## Database Tasks

From repo root (recommended):

- Prepare DB: `pnpm db:prepare` (compose up + create + migrate + sync)
- Reset DB (with confirmation): `pnpm db:reset`

From this folder:

- `pnpm db:create` / `pnpm db:migrate` / `pnpm db:drop`
- `pnpm sync-profile-consents` (with `:full-resync` option)
- `pnpm seed-consent-statements`

## Docker

From repo root:

- Build base image: `pnpm docker:build:base` (uses `Dockerfile`)
- Build Profile API image: `pnpm docker:build:api` (uses `apps/profile-api/Dockerfile`)
- Run: `docker run -p 8003:8003 profile-api`

Run (use your local `.env`):

```bash
docker run -p 8003:8003 --env-file apps/profile-api/.env profile-api:latest
```

## Testing

```bash
pnpm --filter @govie-services/profile-api test         # vitest + coverage
pnpm --filter @govie-services/profile-api test:local   # watch mode
pnpm --filter @govie-services/profile-api test:e2e     # bruno e2e (dev env)
```

## Troubleshooting

- `pnpm dev:health` from the repo root checks DB separately, API liveness at `/health`, and other services
- Ensure PostgreSQL is reachable (compose or local instance)
- Use `LOG_LEVEL=debug` in `.env` for verbose logs

## Useful Links

- [Root README](../../README.md) - Setup and workspace scripts
- [Scripts Documentation](../../scripts/README.md) - Developer experience scripts

## Seeding the PII Hasher Pepper Secret

To seed the PII hasher pepper secret in AWS Secrets Manager, set the following environment variables in your `.env` file:

- `AWS_SECRETS_MANAGER_ENDPOINT` – the Secrets Manager endpoint URL
- `AWS_SECRETS_MANAGER_REGION` – the AWS region
- `PII_HASHER_SECRET_NAME` – the name of the secret to create
- `AWS_ACCESS_KEY_ID` _(optional)_ – AWS access key ID (if not using default credentials)
- `AWS_SECRET_ACCESS_KEY` _(optional)_ – AWS secret access key (if not using default credentials)

Then run:

```bash
pnpm pii-utils:seed-pepper -- --secret-value "<your-secret-value>"
```

The `--secret-value` argument is required and must be at least 12 characters long.
