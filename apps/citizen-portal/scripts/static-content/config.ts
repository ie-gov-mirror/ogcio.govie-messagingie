import { resolve } from "node:path"

export const PAGE_TYPES = {
  list: "life_events.LifeEventsLandingPage",
  lifeEvent: "life_events.LifeEventPage",
} as const

export const SOURCE_LOCALE = "en" as const
export const TRANSLATION_LOCALE = "ga" as const

export const MAX_CONCURRENT_REQUESTS = 4

// Above the API's own limit (about 30s in UAT), so a slow page surfaces as
// the server's error rather than our timeout.
export const REQUEST_TIMEOUT_MS = 60_000

// Wagtail's default WAGTAILAPI_LIMIT_MAX: a higher `limit` returns 400.
export const WAGTAIL_PAGE_LIMIT = 20

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const DISCOVERY_BASE_PATH = "/discovery"

const APP_DIR = resolve(import.meta.dirname, "../..")

export const MOCK_FIXTURES_DIR = resolve(
  APP_DIR,
  "scripts/static-content/fixtures/mock",
)

export const MOCK_INDEX_PAGE_ID = 1000

// TODO: remove with fixtures/uat once UAT is flagged as stable. Until then
// mock mode serves these responses, recorded from UAT on 2026-10-16.
export const UAT_FIXTURES_DIR = resolve(
  APP_DIR,
  "scripts/static-content/fixtures/uat",
)
export const UAT_INDEX_PAGE_ID = 207788

export class ConfigError extends Error {
  name = "ConfigError"
}

export type StaticContentMode = "mock" | "proxy"

// The gov.ie Integration API: Wagtail's pages API behind OAuth2 client
// credentials, with the token endpoint on the same host.
export type CmsApiConfig = {
  baseUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
}

export type StaticContentConfig =
  | { mode: "mock"; indexPageId: number; outputDir: string }
  | { mode: "proxy"; indexPageId: number; outputDir: string; api: CmsApiConfig }

export function readConfig(
  env: Record<string, string | undefined>,
): StaticContentConfig {
  const mode = env.STATIC_CONTENT_MODE?.trim() || "mock"
  if (mode !== "mock" && mode !== "proxy") {
    throw new ConfigError(
      `STATIC_CONTENT_MODE must be "mock" or "proxy", got "${mode}"`,
    )
  }

  const outputDir = env.STATIC_CONTENT_DIR?.trim()
    ? resolve(env.STATIC_CONTENT_DIR.trim())
    : resolve(APP_DIR, ".static-content")

  if (mode === "mock") {
    // TODO: back to MOCK_INDEX_PAGE_ID once UAT is flagged as stable.
    return { mode, indexPageId: UAT_INDEX_PAGE_ID, outputDir }
  }
  return { mode, outputDir, ...readProxyConfig(env) }
}

function readProxyConfig(env: Record<string, string | undefined>): {
  indexPageId: number
  api: CmsApiConfig
} {
  const names = [
    "STATIC_CONTENT_API_URL",
    "STATIC_CONTENT_CLIENT_ID",
    "STATIC_CONTENT_CLIENT_SECRET",
    "STATIC_CONTENT_INDEX_PAGE_ID",
  ] as const
  const missing = names.filter((name) => !env[name]?.trim())
  if (missing.length > 0) {
    throw new ConfigError(
      `STATIC_CONTENT_MODE=proxy needs ${missing.join(", ")}`,
    )
  }
  const value = (name: (typeof names)[number]) => String(env[name]).trim()

  // The client secret goes to the token endpoint, so never over plain HTTP.
  const apiUrl = value("STATIC_CONTENT_API_URL")
  if (!isHttpsUrl(apiUrl)) {
    throw new ConfigError(
      `STATIC_CONTENT_API_URL must be an https URL, got "${apiUrl}"`,
    )
  }
  const baseUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`

  const indexPageId = Number(value("STATIC_CONTENT_INDEX_PAGE_ID"))
  if (!Number.isInteger(indexPageId) || indexPageId <= 0) {
    throw new ConfigError(
      `STATIC_CONTENT_INDEX_PAGE_ID must be a page ID, got "${value("STATIC_CONTENT_INDEX_PAGE_ID")}"`,
    )
  }

  return {
    indexPageId,
    api: {
      baseUrl,
      tokenUrl: new URL("o/token/", baseUrl).href,
      clientId: value("STATIC_CONTENT_CLIENT_ID"),
      clientSecret: value("STATIC_CONTENT_CLIENT_SECRET"),
    },
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}
