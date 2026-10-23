/**
 * Test-only environment stubs.
 *
 * `src/app.ts` registers `@fastify/env` with the schema from `src/config.ts`,
 * which requires a long list of variables (S3, ClamAV, Postgres, LogTo,
 * OTel, ...). The unit test suites under `src/test/**` build the real app
 * (see `app.test.ts`, `routes/files/index.test.ts`,
 * `routes/metadata/index.test.ts`, `routes/permissions/index.test.ts`,
 * `routes/plugins/s3client.test.ts`) but mock every external dependency
 * (S3, Postgres, ClamAV, LogTo, ...), so none of these values are ever used
 * to reach real infrastructure — they only need to satisfy schema
 * validation.
 *
 * These values are deliberately obviously-fake (unroutable hosts, port 0,
 * placeholder credentials) so nobody mistakes them for working
 * configuration. Do NOT use this file for local development — copy
 * `.env.sample` to `.env` for that instead.
 *
 * Values are only applied when a variable isn't already set, so a real
 * `.env` (local dev) or CI-provided secrets always take precedence.
 */
const TEST_ENV_DEFAULTS: Record<string, string> = {
  CLAMAV_HOST: "clamav.test.invalid",
  S3_ENDPOINT: "http://localhost:0",
  S3_REGION: "test-region-1",
  S3_BUCKET_NAME: "test-bucket",
  // Matches `.env.sample`'s own placeholder values — some unit tests
  // (routes/plugins/s3client.test.ts) assert on these exact strings.
  S3_ACCESS_KEY_ID: "123",
  S3_SECRET_ACCESS_KEY: "432",
  MAX_FILE_SIZE: "1",
  LOGTO_JWK_ENDPOINT: "http://localhost:0/oidc/jwks",
  LOGTO_OIDC_ENDPOINT: "http://localhost:0/oidc",
  LOGTO_API_RESOURCE_INDICATOR: "http://localhost:0/",
  HOST: "http://localhost:0",
  POSTGRES_USER: "test-user",
  POSTGRES_PASSWORD: "test-password",
  POSTGRES_HOST: "postgres.test.invalid",
  POSTGRES_PORT: "1",
  POSTGRES_DB_NAME: "test-db",
  PROFILE_BACKEND_URL: "http://localhost:0",
  LOGTO_M2M_SCHEDULER_APP_SECRET: "test-secret",
  LOGTO_M2M_SCHEDULER_APP_ID: "test-app-id",
  LOGTO_M2M_PROFILE_APP_SECRET: "test-secret",
  LOGTO_M2M_PROFILE_APP_ID: "test-app-id",
  SCHEDULER_BACKEND_URL: "http://localhost:0",
  SCHEDULED_JOBS_HOURS_INTERVAL: "1",
  ORGANIZATION_ID: "test-org",
  OTEL_LOG_LEVEL: "ERROR",
  OTEL_SERVER_SERVICE_NAME: "upload-api-test",
  OTEL_COLLECTOR_URL: "http://localhost:0",
};

for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}
