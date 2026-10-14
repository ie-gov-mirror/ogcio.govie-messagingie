import { afterEach, describe, expect, it, vi } from "vitest"

// getEnvConfig caches in a module-level variable, so each test re-imports a
// fresh module to control what it sees.
async function freshGetEnvConfig() {
  vi.resetModules()
  const { getEnvConfig } = await import("./env")
  return getEnvConfig
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("getEnvConfig", () => {
  it("falls back to placeholders when env vars are empty", async () => {
    // empty string is falsy, so getEnvOrPlaceholder falls back
    vi.stubEnv("BASE_URL", "")
    vi.stubEnv("COOKIE_SECRET", "")
    vi.stubEnv("LOGTO_COOKIE_SECRET", "")
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("POSTGRES_PROFILE_SSL", "")
    const getEnvConfig = await freshGetEnvConfig()

    const config = getEnvConfig()

    expect(config.BASE_URL).toBe("http://localhost")
    expect(config.COOKIE_SECRET).toBe("dev-secret")
    expect(config.POSTGRES_PROFILE_SSL).toBe("false")
  })

  it("reads values from the environment when present", async () => {
    vi.stubEnv("BASE_URL", "https://real.example")
    vi.stubEnv("LOGTO_COOKIE_SECRET", "")
    vi.stubEnv("COOKIE_SECRET", "real-secret")
    vi.stubEnv("POSTGRES_MESSAGING_HOST", "db.internal")
    const getEnvConfig = await freshGetEnvConfig()

    const config = getEnvConfig()

    expect(config.BASE_URL).toBe("https://real.example")
    expect(config.COOKIE_SECRET).toBe("real-secret")
    expect(config.POSTGRES_MESSAGING_HOST).toBe("db.internal")
  })

  it("prefers LOGTO_COOKIE_SECRET over COOKIE_SECRET", async () => {
    vi.stubEnv("LOGTO_COOKIE_SECRET", "pod-secret")
    vi.stubEnv("COOKIE_SECRET", "local-secret")
    const getEnvConfig = await freshGetEnvConfig()

    expect(getEnvConfig().COOKIE_SECRET).toBe("pod-secret")
  })

  it("throws in production when no cookie secret is set", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("LOGTO_COOKIE_SECRET", "")
    vi.stubEnv("COOKIE_SECRET", "")
    const getEnvConfig = await freshGetEnvConfig()

    expect(() => getEnvConfig()).toThrow(
      "LOGTO_COOKIE_SECRET or COOKIE_SECRET must be set",
    )
  })

  it("caches the config after the first call", async () => {
    vi.stubEnv("BASE_URL", "https://first.example")
    const getEnvConfig = await freshGetEnvConfig()
    const first = getEnvConfig()
    vi.stubEnv("BASE_URL", "https://changed.example")
    const second = getEnvConfig()

    expect(second).toBe(first)
    expect(second.BASE_URL).toBe("https://first.example")
  })
})
