import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * `/_next/files/` proxies attachment downloads on the portal origin. Its own
 * `add_header` stops it inheriting the server-level headers, so it must set
 * its own nosniff and a sandbox CSP: an attachment must never run as a page
 * with the citizen's session.
 */

// Vitest roots at `apps/citizen-portal`, beside the Dockerfile that envsubsts.
const TEMPLATE_PATH = resolve(process.cwd(), "docker/nginx.conf.template")
const FILES_LOCATION = "location /_next/files/ {"

/** Extracts the body of the `location /_next/files/ { ... }` block. */
function readFilesLocation(): string {
  const template = readFileSync(TEMPLATE_PATH, "utf8")
  const start = template.indexOf(FILES_LOCATION)
  expect(start, "files location not found in template").toBeGreaterThan(-1)
  const end = template.indexOf("\n    }", start)
  expect(end, "files location is unterminated").toBeGreaterThan(start)
  return template.slice(start, end)
}

describe("nginx /_next/files/ headers", () => {
  it("sandboxes downloads with an enforced CSP", () => {
    expect(readFilesLocation()).toMatch(
      /add_header\s+Content-Security-Policy\s+"sandbox; default-src 'none'"\s+always;/,
    )
  })

  it("sets nosniff", () => {
    expect(readFilesLocation()).toMatch(
      /add_header\s+X-Content-Type-Options\s+"nosniff"\s+always;/,
    )
  })
})
