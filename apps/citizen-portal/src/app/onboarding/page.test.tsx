import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Regression guard for AB#40235.
 *
 * `OnboardingShell` runs the SAG provider as the `profile` app, so the
 * session and sign-in bind to `profile`. The onboarding POST must therefore
 * send `X-Application: profile` too. A previous version read the app name from
 * `useEnv()` (the app's own `NEXT_PUBLIC_SAG_APP_NAME`, i.e. `citizen-portal`),
 * so the POST declared `citizen-portal` against a `profile`-bound session and
 * the gateway's strict per-app match returned 401 — surfacing as the generic
 * "Something went wrong during onboarding" screen for every new citizen.
 *
 * This test pins the contract: the onboarding POST uses the SAG *client*
 * (provider) identity, NOT the env identity. `useEnv()` is deliberately mocked
 * to a DIFFERENT app name so a regression to env-derived values fails here.
 */

const signIn = vi.fn()

vi.mock("@ogcio/sag-client/react", () => ({
  CONNECTOR_MYGOVID: "mygovid",
  useAuth: () => ({
    user: { sub: "user-1" },
    loading: false,
    signIn,
  }),
  useGatewayFetch: () => ({ data: null, refresh: vi.fn() }),
  // The enclosing OnboardingShell provides the `profile` app identity.
  useSagClient: () => ({
    gatewayUrl: "http://sag.local.test:3333",
    appName: "profile",
  }),
}))

// Deliberately different from the provider's app name — if the POST regresses
// to reading env, the assertions below break.
vi.mock("@citizen-portal/shared", () => ({
  useEnv: () => ({
    hosts: {
      messages: "http://messaging.local.test",
      profile: "http://profile.local.test",
      dashboard: "http://dashboard.local.test",
    },
    sagUrl: "http://WRONG-env-url.local.test:9999",
    sagAppName: "citizen-portal",
  }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => `onboard.${key}`
    t.rich = (key: string) => `onboard.${key}`
    return t
  },
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/env/env.client", () => ({
  env: { NEXT_PUBLIC_BASE_URL: "http://base.local.test" },
}))

vi.mock("@ogcio/design-system-react", () => ({
  Heading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href='https://example.test'>{children}</a>
  ),
  Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Spinner: () => <div data-testid='spinner' />,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import OnboardingPage from "@/app/onboarding/page"

describe("OnboardingPage — onboarding POST identity (AB#40235)", () => {
  const fetchMock = vi.fn()
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    fetchMock.mockReset()
    signIn.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("POSTs onboarding with the SAG client's app name and gateway URL, not the env values", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })

    render(<OnboardingPage />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://sag.local.test:3333/profile/api/v1/onboarding")
    expect(init.method).toBe("POST")
    expect(init.credentials).toBe("include")

    const headers = init.headers as Record<string, string>
    // The load-bearing assertion: matches the provider-bound session app.
    expect(headers["X-Application"]).toBe("profile")
    expect(headers["X-Application"]).not.toBe("citizen-portal")
  })
})
