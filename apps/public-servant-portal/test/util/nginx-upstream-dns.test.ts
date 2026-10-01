import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The proxied upstreams sit behind CloudFront, which rotates edge IPs. A
 * literal `proxy_pass` host is resolved once at nginx start and pinned, so a
 * long-lived pod ends up on dead edges and answers 502. A variable
 * `proxy_pass` plus a runtime `resolver` makes nginx re-resolve on TTL.
 */

// Vitest roots at `apps/public-servant-portal`, beside the Dockerfile that envsubsts.
const TEMPLATE_PATH = resolve(process.cwd(), "docker/nginx.conf.template")
const CLOUDFRONT_PROXIES = ["/_next/analytics-api/", "/_next/ff/"]

const template = readFileSync(TEMPLATE_PATH, "utf8")

/** Extracts the body of `location <prefix> { ... }`. */
function readLocation(prefix: string): string {
  const start = template.indexOf(`location ${prefix} {`)
  expect(start, `location ${prefix} not found in template`).toBeGreaterThan(-1)
  return template.slice(start, template.indexOf("\n    }", start))
}

describe("nginx re-resolves CloudFront upstreams at runtime", () => {
  it("includes the resolver generated at container start", () => {
    expect(template).toContain("include /tmp/resolver.conf*;")
  })

  it.each(CLOUDFRONT_PROXIES)("%s proxies through a variable", (prefix) => {
    expect(readLocation(prefix)).toMatch(/^\s*proxy_pass \$[a-z_]+;$/m)
  })
})
