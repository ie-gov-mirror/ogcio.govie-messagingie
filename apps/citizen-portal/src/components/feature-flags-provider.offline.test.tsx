import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Real Unleash client (no mock): the noise comes from how the client reports
// a rejected flag fetch, so the library's own catch block has to run.
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

const FETCH_ERROR_LOG = "Unleash: unable to fetch feature toggles"
const SETTLE_MS = 50

// Lets the client's promise chain (init -> first fetch -> catch) run to the end.
const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, SETTLE_MS)))

const loggedFetchError = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.some(([message]) => message === FETCH_ERROR_LOG)

describe("FeatureFlagsProvider — failed flag fetch", () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("is not reported while the browser is offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)

    render(
      <FeatureFlagsProvider>
        <div />
      </FeatureFlagsProvider>,
    )
    await settle()

    expect(loggedFetchError(consoleError)).toBe(false)
  })

  it("is still reported while the browser is online", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)

    render(
      <FeatureFlagsProvider>
        <div />
      </FeatureFlagsProvider>,
    )
    await settle()

    expect(loggedFetchError(consoleError)).toBe(true)
  })
})
