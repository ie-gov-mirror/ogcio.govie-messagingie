import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Real Unleash client (no mock): usage metrics are sent by the client's own
// timers, so the provider's config has to reach the real thing.
const env = vi.hoisted(() => ({
  NEXT_PUBLIC_UNLEASH_URL: "http://unleash.test/api/frontend",
  NEXT_PUBLIC_UNLEASH_CLIENT_KEY: "client-key",
  NEXT_PUBLIC_UNLEASH_APP_NAME: "citizen-portal",
}))

vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({ user: undefined }),
}))

vi.mock("@/env/env.client", () => ({ env }))

import { FeatureFlagsProvider } from "@/components/feature-flags-provider"

const METRICS_PATH = "/client/metrics"
// Unleash client default for the first metrics send, plus headroom.
const FIRST_METRICS_SEND_MS = 3_000

const flagsResponse = {
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({ toggles: [] }),
}

const requestedMetrics = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.some(([url]) => String(url).endsWith(METRICS_PATH))

const requestedFlags = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.some(([, init]) => init?.method === "GET")

describe("FeatureFlagsProvider — usage metrics", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn().mockResolvedValue(flagsResponse)
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("are not sent to the flag server", async () => {
    render(
      <FeatureFlagsProvider>
        <div />
      </FeatureFlagsProvider>,
    )
    await act(() => vi.advanceTimersByTimeAsync(FIRST_METRICS_SEND_MS))

    expect(requestedFlags(fetchMock)).toBe(true)
    expect(requestedMetrics(fetchMock)).toBe(false)
  })
})
