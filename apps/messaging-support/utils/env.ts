export interface EnvConfig {
  BASE_URL: string
  LOGTO_URL: string
  COOKIE_SECRET: string
  M2M_MANAGEMENT_ID: string
  M2M_MANAGEMENT_SECRET: string
  MANAGEMENT_API: string
  OTEL_SERVER_SERVICE_NAME: string
  OTEL_COLLECTOR_URL: string | undefined
  POSTGRES_MESSAGING_USER: string
  POSTGRES_MESSAGING_PASSWORD: string
  POSTGRES_MESSAGING_HOST: string
  POSTGRES_MESSAGING_PORT: string
  POSTGRES_MESSAGING_DATABASE: string
  POSTGRES_MESSAGING_SSL: string
  POSTGRES_PROFILE_USER: string
  POSTGRES_PROFILE_PASSWORD: string
  POSTGRES_PROFILE_HOST: string
  POSTGRES_PROFILE_PORT: string
  POSTGRES_PROFILE_DATABASE: string
  POSTGRES_PROFILE_SSL: string
  MICROSOFT_CLIENT_ID: string
  MICROSOFT_CLIENT_SECRET: string
  MICROSOFT_TENANT_ID: string
  LOGTO_M2M_CLIENT_ID: string
  LOGTO_M2M_CLIENT_SECRET: string
  PROFILE_API_RESOURCE_URL: string
  AUDIT_API_URL: string
  LOGTO_PLATFORM_ADMIN_RESOURCE: string
  ANALYTICS_URL: string
  ANALYTICS_WEBSITE_ID: string
  ANALYTICS_ORGANIZATION_ID: string
}

let cachedEnv: EnvConfig | null = null

function getEnvOrPlaceholder(key: string, placeholder: string) {
  return process.env[key] || placeholder
}

// Pods inject LOGTO_COOKIE_SECRET. COOKIE_SECRET is the local name.
// The placeholder is only for local/test; production must fail closed.
function resolveCookieSecret(): string {
  const secret = process.env.LOGTO_COOKIE_SECRET || process.env.COOKIE_SECRET
  if (secret) {
    return secret
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("LOGTO_COOKIE_SECRET or COOKIE_SECRET must be set")
  }
  return "dev-secret"
}

export const getEnvConfig = (): EnvConfig => {
  if (cachedEnv) {
    return cachedEnv
  }

  cachedEnv = {
    BASE_URL: getEnvOrPlaceholder("BASE_URL", "http://localhost"),
    LOGTO_URL: getEnvOrPlaceholder("LOGTO_URL", "https://dummy-logto"),
    COOKIE_SECRET: resolveCookieSecret(),
    M2M_MANAGEMENT_ID: getEnvOrPlaceholder("M2M_MANAGEMENT_ID", "dummy-id"),
    M2M_MANAGEMENT_SECRET: getEnvOrPlaceholder(
      "M2M_MANAGEMENT_SECRET",
      "dummy-secret",
    ),
    MANAGEMENT_API: getEnvOrPlaceholder("MANAGEMENT_API", "https://dummy-api"),
    OTEL_SERVER_SERVICE_NAME: getEnvOrPlaceholder(
      "OTEL_SERVER_SERVICE_NAME",
      "dummy-service",
    ),
    OTEL_COLLECTOR_URL: process.env["OTEL_COLLECTOR_URL"],

    POSTGRES_MESSAGING_USER: getEnvOrPlaceholder(
      "POSTGRES_MESSAGING_USER",
      "user",
    ),
    POSTGRES_MESSAGING_PASSWORD: getEnvOrPlaceholder(
      "POSTGRES_MESSAGING_PASSWORD",
      "password",
    ),
    POSTGRES_MESSAGING_HOST: getEnvOrPlaceholder(
      "POSTGRES_MESSAGING_HOST",
      "localhost",
    ),
    POSTGRES_MESSAGING_PORT: getEnvOrPlaceholder(
      "POSTGRES_MESSAGING_PORT",
      "5432",
    ),
    POSTGRES_MESSAGING_DATABASE: getEnvOrPlaceholder(
      "POSTGRES_MESSAGING_DATABASE",
      "messaging",
    ),
    POSTGRES_PROFILE_USER: getEnvOrPlaceholder("POSTGRES_PROFILE_USER", "user"),
    POSTGRES_PROFILE_PASSWORD: getEnvOrPlaceholder(
      "POSTGRES_PROFILE_PASSWORD",
      "password",
    ),
    POSTGRES_PROFILE_HOST: getEnvOrPlaceholder(
      "POSTGRES_PROFILE_HOST",
      "localhost",
    ),
    POSTGRES_PROFILE_PORT: getEnvOrPlaceholder("POSTGRES_PROFILE_PORT", "5432"),
    POSTGRES_PROFILE_DATABASE: getEnvOrPlaceholder(
      "POSTGRES_PROFILE_DATABASE",
      "profiles",
    ),
    POSTGRES_PROFILE_SSL: getEnvOrPlaceholder("POSTGRES_PROFILE_SSL", "false"),
    POSTGRES_MESSAGING_SSL: getEnvOrPlaceholder(
      "POSTGRES_MESSAGING_SSL",
      "false",
    ),
    MICROSOFT_CLIENT_ID: getEnvOrPlaceholder("MICROSOFT_CLIENT_ID", "dummy-id"),
    MICROSOFT_CLIENT_SECRET: getEnvOrPlaceholder(
      "MICROSOFT_CLIENT_SECRET",
      "dummy-secret",
    ),
    MICROSOFT_TENANT_ID: getEnvOrPlaceholder(
      "MICROSOFT_TENANT_ID",
      "dummy-tenant",
    ),
    LOGTO_M2M_CLIENT_ID: getEnvOrPlaceholder("LOGTO_M2M_CLIENT_ID", "dummy-id"),
    LOGTO_M2M_CLIENT_SECRET: getEnvOrPlaceholder(
      "LOGTO_M2M_CLIENT_SECRET",
      "dummy-secret",
    ),
    PROFILE_API_RESOURCE_URL: getEnvOrPlaceholder(
      "PROFILE_API_RESOURCE_URL",
      "dummy-url",
    ),
    AUDIT_API_URL: getEnvOrPlaceholder("AUDIT_API_URL", "dummy"),
    LOGTO_PLATFORM_ADMIN_RESOURCE: getEnvOrPlaceholder(
      "LOGTO_PLATFORM_ADMIN_RESOURCE",
      "dummy",
    ),
    ANALYTICS_URL: getEnvOrPlaceholder("ANALYTICS_URL", "dummy"),
    ANALYTICS_WEBSITE_ID: getEnvOrPlaceholder("ANALYTICS_WEBSITE_ID", "dummy"),
    ANALYTICS_ORGANIZATION_ID: getEnvOrPlaceholder(
      "ANALYTICS_ORGANIZATION_ID",
      "dummy",
    ),
  }

  return cachedEnv
}
