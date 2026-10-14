import { resolve } from "node:path"

// Placeholders until Carbon names the page types (ADR OQ2).
export const PAGE_TYPES = {
  list: "lea.ListPage",
  lifeEvent: "lea.LifeEventPage",
  journey: "lea.JourneyPage",
} as const

export const SOURCE_LOCALE = "en" as const
export const TRANSLATION_LOCALE = "ga" as const

export const MAX_CONCURRENT_REQUESTS = 4

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

export class ConfigError extends Error {
  name = "ConfigError"
}

export type StaticContentMode = "mock"

export type StaticContentConfig = {
  mode: StaticContentMode
  indexPageId: number
  outputDir: string
}

export function readConfig(
  env: Record<string, string | undefined>,
): StaticContentConfig {
  const mode = env.STATIC_CONTENT_MODE?.trim() || "mock"
  if (mode === "proxy") {
    throw new ConfigError("STATIC_CONTENT_MODE=proxy is not implemented yet")
  }
  if (mode !== "mock") {
    throw new ConfigError(
      `STATIC_CONTENT_MODE must be "mock" or "proxy", got "${mode}"`,
    )
  }

  const outputDir = env.STATIC_CONTENT_DIR?.trim()
    ? resolve(env.STATIC_CONTENT_DIR.trim())
    : resolve(APP_DIR, ".static-content")

  return { mode, indexPageId: MOCK_INDEX_PAGE_ID, outputDir }
}
