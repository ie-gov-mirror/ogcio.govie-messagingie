export const envSchema = {
  type: "object",
  required: [
    "CLAMAV_HOST",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET_NAME",
    "MAX_FILE_SIZE",
    "LOGTO_JWK_ENDPOINT",
    "LOGTO_OIDC_ENDPOINT",
    "LOGTO_API_RESOURCE_INDICATOR",
    "HOST",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_DB_NAME",
    "PROFILE_BACKEND_URL",
    "LOGTO_M2M_SCHEDULER_APP_SECRET",
    "LOGTO_M2M_SCHEDULER_APP_ID",
    "LOGTO_M2M_PROFILE_APP_SECRET",
    "LOGTO_M2M_PROFILE_APP_ID",
    "SCHEDULER_BACKEND_URL",
    "SCHEDULED_JOBS_HOURS_INTERVAL",
    "ORGANIZATION_ID",
    "OTEL_LOG_LEVEL",
    "OTEL_SERVER_SERVICE_NAME",
    "OTEL_COLLECTOR_URL",
  ],
  properties: {
    CLAMAV_HOST: { type: "string" },
    S3_ENDPOINT: { type: "string" },
    S3_REGION: { type: "string" },
    S3_ACCESS_KEY_ID: { type: "string" },
    S3_SECRET_ACCESS_KEY: { type: "string" },
    S3_BUCKET_NAME: { type: "string" },
    MAX_FILE_SIZE: { type: "number" },
    LOGTO_JWK_ENDPOINT: { type: "string" },
    LOGTO_OIDC_ENDPOINT: { type: "string" },
    LOGTO_API_RESOURCE_INDICATOR: { type: "string" },
    HOST: { type: "string" },
    POSTGRES_USER: {
      type: "string",
    },
    POSTGRES_PASSWORD: {
      type: "string",
    },
    POSTGRES_HOST: {
      type: "string",
    },
    POSTGRES_PORT: {
      type: "number",
    },
    POSTGRES_DB_NAME: {
      type: "string",
    },
    PROFILE_BACKEND_URL: {
      type: "string",
    },
    LOGTO_M2M_SCHEDULER_APP_SECRET: {
      type: "string",
    },
    LOGTO_M2M_SCHEDULER_APP_ID: {
      type: "string",
    },
    LOGTO_M2M_PROFILE_APP_SECRET: {
      type: "string",
    },
    LOGTO_M2M_PROFILE_APP_ID: {
      type: "string",
    },
    SCHEDULER_BACKEND_URL: {
      type: "string",
    },
    SCHEDULED_JOBS_HOURS_INTERVAL: {
      type: "number",
    },
    ORGANIZATION_ID: {
      type: "string",
    },
    OTEL_LOG_LEVEL: { type: "string" },
    OTEL_SERVER_SERVICE_NAME: { type: "string" },
    OTEL_COLLECTOR_URL: { type: "string" },
    UPLOAD_LIMIT_PER_IP_PER_MINUTE: { type: "number" },
    MAX_SUPPORT_FILE_SIZE_MB: { type: "number", default: 1024 },
    CLAMAV_CHUNKS_NUMBER: { type: "number", default: 4 },
    CLAMAV_CHUNK_SIZE_KB: { type: "number", default: 128 },
    ANTIVIRUS_SCAN_ENABLED: { type: "boolean", default: true },
    S3_CHUNKS_NUMBER: { type: "number", default: 4 },
    S3_CHUNK_SIZE_MB: { type: "number", default: 5 },
    POSTGRES_SSL: {
      type: "boolean",
      default: false,
    },
    AWS_ACCESS_KEY_ID: { type: "string" },
    AWS_SECRET_ACCESS_KEY: { type: "string" },
    AWS_SECRETS_MANAGER_ENDPOINT: { type: "string" },
    AWS_SECRETS_MANAGER_REGION: { type: "string" },
    PII_HASHER_SECRET_NAME: { type: "string" },
  },
};

export interface EnvDbConfig {
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_DB_NAME: string;
  POSTGRES_SSL: boolean;
}
