import { afterEach, describe, expect, it, vi } from "vitest"

describe("client environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("defaults the base URL to the portal's dev port", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", undefined)
    vi.stubEnv("NEXT_PUBLIC_SAG_URL", "http://localhost:3030")
    vi.resetModules()
    const { env } = await import("./env.client")

    expect(env.NEXT_PUBLIC_BASE_URL).toBe("http://localhost:4002")
  })
})
