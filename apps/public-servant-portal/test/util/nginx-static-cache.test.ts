import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * `/_next/static/` is served `immutable` for a year. With nginx's `always`
 * flag that header also lands on 404s, so a chunk missing for a moment during
 * a rolling deploy (old and new pods serve side by side) stays missing in that
 * browser's cache long after the pods converge, and every reload replays it.
 */

// Vitest roots at `apps/public-servant-portal`, beside the Dockerfile that envsubsts.
const TEMPLATE_PATH = resolve(process.cwd(), "docker/nginx.conf.template")
const STATIC_LOCATION = "location /_next/static/ {"
const CACHE_CONTROL_DIRECTIVE =
  /add_header\s+Cache-Control\s+"[^"]*immutable[^"]*"([^;]*);/

/** Extracts the body of the `location /_next/static/ { ... }` block. */
function readStaticLocation(): string {
  const template = readFileSync(TEMPLATE_PATH, "utf8")
  const start = template.indexOf(STATIC_LOCATION)
  expect(start, "static location not found in template").toBeGreaterThan(-1)
  const end = template.indexOf("\n    }", start)
  expect(end, "static location is unterminated").toBeGreaterThan(start)
  return template.slice(start, end)
}

describe("nginx /_next/static/ caching", () => {
  it("sets the immutable Cache-Control header", () => {
    // Without this, a reformatted directive makes the case below pass vacuously.
    expect(readStaticLocation()).toMatch(CACHE_CONTROL_DIRECTIVE)
  })

  it("does not apply the immutable header to error responses", () => {
    const flags = readStaticLocation().match(CACHE_CONTROL_DIRECTIVE)?.[1]

    expect(flags).not.toMatch(/\balways\b/)
  })
})
