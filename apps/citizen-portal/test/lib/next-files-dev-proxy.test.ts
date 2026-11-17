import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants"
import { afterEach, describe, expect, it, vi } from "vitest"
import citizenPortalConfig from "../../next.config"

/**
 * Under `next dev` there is no nginx, so `/_next/files/` must be proxied to
 * the gateway by Next itself, the way nginx does in deployed runs.
 */

const SAG_URL = "http://sag.local.test:3333"
const FILES_SOURCE = "/_next/files/:path*"

type Rewrite = { source: string; destination: string }

async function rewritesFor(phase: string): Promise<Rewrite[]> {
  const config = citizenPortalConfig(phase)
  const rewrites = await config.rewrites?.()
  return Array.isArray(rewrites) ? (rewrites as Rewrite[]) : []
}

describe("next.config /_next/files/ dev proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("proxies files to the gateway as the messaging app in dev", async () => {
    vi.stubEnv("NEXT_PUBLIC_SAG_URL", `${SAG_URL}/`)

    const rewrites = await rewritesFor(PHASE_DEVELOPMENT_SERVER)

    expect(rewrites).toContainEqual({
      source: FILES_SOURCE,
      destination: `${SAG_URL}/:path*?app=messaging`,
    })
  })

  it("keeps the analytics dev proxy", async () => {
    const rewrites = await rewritesFor(PHASE_DEVELOPMENT_SERVER)

    expect(rewrites.map((rewrite) => rewrite.source)).toContain(
      "/_next/analytics-api/:path*",
    )
  })

  it("leaves the production build to nginx", async () => {
    const rewrites = await rewritesFor(PHASE_PRODUCTION_BUILD)

    expect(rewrites).toEqual([])
  })
})
