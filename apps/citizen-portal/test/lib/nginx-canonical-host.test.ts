import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { ZONE_BY_FIRST_SEGMENT, type Zone } from "@/util/get-zone-from-path"

/**
 * The template's `$canonical_host` map must mirror `ZONE_BY_FIRST_SEGMENT`
 * (see that table for what drift breaks). Nothing enforced it and it drifted
 * twice, so parse the real template rather than a copy.
 */

// Vitest roots at `apps/citizen-portal`, beside the Dockerfile that envsubsts.
const TEMPLATE_PATH = resolve(process.cwd(), "docker/nginx.conf.template")

const HOST_VAR_ZONE: Record<string, Zone> = {
  "${MESSAGING_HOST}": "messages",
  "${PROFILE_HOST}": "profile",
  "${DASHBOARD_HOST}": "dashboard",
}

/** Extracts the body of the `map $uri $canonical_host { ... }` block. */
function readCanonicalHostMap(): string {
  const template = readFileSync(TEMPLATE_PATH, "utf8")
  const start = template.indexOf("map $uri $canonical_host {")
  expect(start, "canonical_host map not found in template").toBeGreaterThan(-1)
  const end = template.indexOf("\n  }", start)
  expect(end, "canonical_host map is unterminated").toBeGreaterThan(start)
  return template.slice(start, end)
}

/**
 * Only `~^/[a-z]{2}/(...)` keys are relevant: the no-locale keys
 * (`/onboarding`, `/api/...`) are matched by `getZoneFromPath`'s explicit
 * profile branch, not by the segment table.
 */
function parseNginxLocaleSegments(): Record<string, Zone> {
  const keyPattern =
    /"~\^\/\[a-z\]\{2\}\/\(?([a-z|-]+?)\)?\(\/\|\$\)"\s+(\$\{[A-Z_]+\})/g
  const owned: Record<string, Zone> = {}

  for (const [, alternation, hostVar] of readCanonicalHostMap().matchAll(
    keyPattern,
  )) {
    const zone = HOST_VAR_ZONE[hostVar]
    expect(
      zone,
      `unknown host var ${hostVar} in canonical_host map`,
    ).toBeDefined()
    for (const segment of alternation.split("|")) {
      owned[segment] = zone
    }
  }

  return owned
}

describe("nginx canonical_host map mirrors the zone table", () => {
  it("parses the locale-prefixed keys out of the real template", () => {
    // Without this, a regex broken by reformatting makes every case below
    // pass vacuously on an empty object.
    const owned = parseNginxLocaleSegments()
    expect(Object.keys(owned).length).toBeGreaterThanOrEqual(
      Object.keys(ZONE_BY_FIRST_SEGMENT).length,
    )
  })

  it.each(Object.entries(ZONE_BY_FIRST_SEGMENT))(
    "canonicalises /{locale}/%s to the %s host",
    (segment, zone) => {
      expect(parseNginxLocaleSegments()[segment]).toBe(zone)
    },
  )

  it("never claims a segment the zone table doesn't know about", () => {
    for (const [segment, zone] of Object.entries(parseNginxLocaleSegments())) {
      expect(
        ZONE_BY_FIRST_SEGMENT[segment],
        `nginx-only segment ${segment}`,
      ).toBe(zone)
    }
  })
})
