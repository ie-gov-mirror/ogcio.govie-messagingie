import { afterEach, describe, expect, it, vi } from "vitest"

const booleanVariables = [
  "NEXT_PUBLIC_ENABLE_DASHBOARD",
  "NEXT_PUBLIC_ENABLE_MESSAGING",
  "NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION",
  "NEXT_PUBLIC_ENABLE_PAYMENTS_INTEGRATION",
  "NEXT_PUBLIC_ENABLE_FORMS_INTEGRATION",
  "NEXT_PUBLIC_ENABLE_LEA",
  "NEXT_PUBLIC_ENABLE_FOLDERS",
  "NEXT_PUBLIC_ENABLE_MOCK_MESSAGES",
  "NEXT_PUBLIC_ANALYTICS_DRY_RUN",
  "NEXT_PUBLIC_FARO_REPLAY_ENABLED",
] as const

async function loadEnv(value: string | undefined) {
  for (const variable of booleanVariables) {
    vi.stubEnv(variable, value)
  }
  vi.resetModules()
  return import("./env.client")
}

describe("client environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("uses the intended boolean defaults", async () => {
    const { env } = await loadEnv(undefined)

    expect(env.NEXT_PUBLIC_ENABLE_DASHBOARD).toBe(true)
    expect(env.NEXT_PUBLIC_ENABLE_LEA).toBe(false)
    expect(env.NEXT_PUBLIC_ENABLE_FOLDERS).toBe(false)
    expect(env.NEXT_PUBLIC_ENABLE_MOCK_MESSAGES).toBe(false)
    expect(env.NEXT_PUBLIC_ANALYTICS_DRY_RUN).toBe(true)
    expect(env.NEXT_PUBLIC_FARO_REPLAY_ENABLED).toBe(false)
  })

  it("normalises truthy build values", async () => {
    const { env } = await loadEnv(" YES ")

    expect(env.NEXT_PUBLIC_ENABLE_DASHBOARD).toBe(true)
    expect(env.NEXT_PUBLIC_ENABLE_LEA).toBe(true)
    expect(env.NEXT_PUBLIC_ENABLE_FOLDERS).toBe(true)
    expect(env.NEXT_PUBLIC_ENABLE_MOCK_MESSAGES).toBe(true)
    expect(env.NEXT_PUBLIC_ANALYTICS_DRY_RUN).toBe(true)
  })

  it("normalises false build values", async () => {
    const { env } = await loadEnv("OFF")

    expect(env.NEXT_PUBLIC_ENABLE_DASHBOARD).toBe(false)
    expect(env.NEXT_PUBLIC_ENABLE_LEA).toBe(false)
    expect(env.NEXT_PUBLIC_ENABLE_FOLDERS).toBe(false)
    expect(env.NEXT_PUBLIC_ENABLE_MOCK_MESSAGES).toBe(false)
    expect(env.NEXT_PUBLIC_ANALYTICS_DRY_RUN).toBe(false)
  })

  it("falls back safely for unrecognised build values", async () => {
    const { env } = await loadEnv("sometimes")

    expect(env.NEXT_PUBLIC_ENABLE_DASHBOARD).toBe(true)
    expect(env.NEXT_PUBLIC_ENABLE_LEA).toBe(false)
    expect(env.NEXT_PUBLIC_ENABLE_FOLDERS).toBe(false)
    expect(env.NEXT_PUBLIC_ENABLE_MOCK_MESSAGES).toBe(false)
    expect(env.NEXT_PUBLIC_ANALYTICS_DRY_RUN).toBe(true)
  })

  it("sends public servants to the Public Servant Portal by default", async () => {
    vi.stubEnv("NEXT_PUBLIC_MESSAGING_ADMIN_URL", undefined)
    vi.resetModules()
    const { env } = await import("./env.client")

    expect(env.NEXT_PUBLIC_MESSAGING_ADMIN_URL).toBe("http://localhost:4002")
  })

  it("turns empty optional URLs into undefined", async () => {
    vi.stubEnv("NEXT_PUBLIC_UNLEASH_URL", "")
    vi.resetModules()
    const { env } = await import("./env.client")

    expect(env.NEXT_PUBLIC_UNLEASH_URL).toBeUndefined()
  })
})
