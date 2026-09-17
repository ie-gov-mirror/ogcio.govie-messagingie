import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const POST_REDIRECT_URI = "https://journey.uat.test/journey/abc-123"

const { searchParamsHolder } = vi.hoisted(() => ({
  searchParamsHolder: { value: new URLSearchParams() },
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsHolder.value,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// Stub only the constants: the barrel re-exports extension-less ESM paths
// that Node cannot resolve under Vitest.
vi.mock("@ogcio/sag-client/react", () => ({
  MESSAGING_PUBLIC_SERVANT_ROLE_NAME: "Messaging Public Servant",
  PROFILE_PUBLIC_SERVANT_ROLE_NAME: "Profile Public Servant",
}))

vi.mock("@citizen-portal/shared", () => ({
  getEnv: () => ({
    hosts: {
      messages: "https://messages.uat.test",
      profile: "https://profile.uat.test",
      dashboard: "https://dashboard.uat.test",
    },
    sagUrl: "https://sag.uat.test",
    sagAppName: "profile",
  }),
}))

const envHolder = vi.hoisted(() => ({
  value: {
    NEXT_PUBLIC_BASE_URL: "https://citizen.uat.test",
    NEXT_PUBLIC_SAG_URL: "https://sag.uat.test",
    NEXT_PUBLIC_DASHBOARD_ADMIN_URL: "https://dashboard-admin.uat.test",
    NEXT_PUBLIC_PAYMENTS_URL: "https://payments.uat.test",
    NEXT_PUBLIC_JOURNEY_URL: "https://journey.uat.test",
    NEXT_PUBLIC_FORMS_URL: "https://forms.uat.test",
    NEXT_PUBLIC_PROFILE_ADMIN_URL: "https://profile-admin.uat.test",
    NEXT_PUBLIC_MESSAGING_ADMIN_URL: "https://messaging-admin.uat.test",
    NEXT_PUBLIC_MYGOVID_END_SESSION_URL: undefined as string | undefined,
    // Topology flags default enabled (AB#39580): payments + journey are
    // part of this deployment, so their sign-out iframes are fanned out.
    // (Dedicated gating coverage lives in test/components/global-signout.test.tsx.)
    NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION: true,
    NEXT_PUBLIC_ENABLE_PAYMENTS_INTEGRATION: true,
    NEXT_PUBLIC_ENABLE_FORMS_INTEGRATION: true,
  },
}))
vi.mock("@/env/env.client", () => ({
  get env() {
    return envHolder.value
  },
}))

const MYGOVID_END_SESSION_URL =
  "https://nonprod-account.mygovid-nonprod.ie/policy/oauth2/v2.0/logout"

import { GlobalSignout } from "./global-signout"

let hrefValue = ""

beforeEach(() => {
  hrefValue = ""
  envHolder.value.NEXT_PUBLIC_MYGOVID_END_SESSION_URL = undefined
  for (const name of ["postGlobalSignoutUrl", "postGlobalSignoutMyGovId"]) {
    // biome-ignore lint/suspicious/noDocumentCookie: reset between tests
    document.cookie = `${name}=; Max-Age=0; path=/`
  }
  vi.useFakeTimers()
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return hrefValue
      },
      set href(value: string) {
        hrefValue = value
      },
      hostname: "citizen.uat.test",
    },
  })
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("GlobalSignout (sagSignout flow)", () => {
  // After the iframe fan-out and the minimum delay, a sagSignout must land
  // the browser on the postRedirectUri it was given.
  it("redirects to postRedirectUri once signout completes", () => {
    searchParamsHolder.value = new URLSearchParams({
      postRedirectUri: POST_REDIRECT_URI,
      sagSignout: "true",
    })

    render(<GlobalSignout />)

    // Advance past both the iframe-load fallback timeout (20s) and the
    // minimum display delay (3s) so the completion effect fires.
    act(() => {
      vi.advanceTimersByTime(20_000)
    })

    expect(hrefValue).toBe(POST_REDIRECT_URI)
  })

  // AB#39676: both sign-out branches converge on /post-global-signout, which
  // ends the upstream Azure B2C session for citizens via a top-level navigation
  // (an iframe cannot carry the cross-site B2C cookies). A SAG citizen is routed
  // straight there with the MyGovID flag + destination cookies set.
  it("routes a citizen through /post-global-signout with the MyGovID flag set", () => {
    envHolder.value.NEXT_PUBLIC_MYGOVID_END_SESSION_URL =
      MYGOVID_END_SESSION_URL
    searchParamsHolder.value = new URLSearchParams({
      postRedirectUri: POST_REDIRECT_URI,
      sagSignout: "true",
      role: "citizen",
    })

    render(<GlobalSignout />)

    act(() => {
      vi.advanceTimersByTime(20_000)
    })

    expect(hrefValue).toBe("https://citizen.uat.test/post-global-signout")
    expect(document.cookie).toContain("postGlobalSignoutUrl=")
    expect(document.cookie).toContain("postGlobalSignoutMyGovId=1")
  })
})

// AB#39970 — the consolidated citizen-portal zones (messages / profile /
// dashboard) ride a single shared SAG session, so the SAG clear-session call
// logs the user out of every zone at once. Only apps that keep their OWN
// session cookies need a per-origin iframe. These tests pin that fan-out
// contract so the dropped per-zone calls and the role-gated admin calls don't
// silently regress.
describe("GlobalSignout (iframe fan-out)", () => {
  /** Render for a given role and return the iframe `src`s that were emitted. */
  async function iframeSrcsForRole(role: string | null): Promise<string[]> {
    const params: Record<string, string> = {
      sagSignout: "true",
      postRedirectUri: POST_REDIRECT_URI,
    }
    if (role !== null) {
      params.role = role
    }
    searchParamsHolder.value = new URLSearchParams(params)
    render(<GlobalSignout />)
    const srcs = Array.from(document.querySelectorAll("iframe")).map(
      (frame) => frame.getAttribute("src") ?? "",
    )
    // Settle all pending timers/iframe-load state updates inside act() so
    // React doesn't warn about updates outside act(). The srcs are already
    // captured above; advancing here just lets the component finish cleanly.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    return srcs
  }

  it("citizen: clears only independent apps (payments, journey, forms) + SAG session", async () => {
    const srcs = await iframeSrcsForRole("citizen")

    // Apps with their own session cookies are still cleared per-origin.
    expect(srcs).toContain("https://payments.uat.test/application-signout")
    expect(srcs).toContain("https://journey.uat.test/application-signout")
    expect(srcs).toContain("https://forms.uat.test/api/application-signout")
    // The single shared SAG session is wiped once.
    expect(srcs).toContain("https://sag.uat.test/auth/clear-session")

    // The consolidated citizen zones are NOT fanned out — they share the
    // SAG session cleared above.
    expect(srcs.some((s) => s.includes("messages.uat.test"))).toBe(false)
    expect(srcs.some((s) => s.includes("profile.uat.test"))).toBe(false)
    expect(srcs.some((s) => s.includes("dashboard.uat.test"))).toBe(false)

    // Admin apps are public-servant only — never cleared for citizens.
    expect(srcs.some((s) => s.includes("admin"))).toBe(false)
  })

  it("public servant: also clears the admin apps", async () => {
    const srcs = await iframeSrcsForRole("publicServant")

    expect(srcs).toContain(
      "https://dashboard-admin.uat.test/application-signout",
    )
    expect(srcs).toContain(
      "https://profile-admin.uat.test/api/application-signout",
    )
    expect(srcs).toContain(
      "https://messaging-admin.uat.test/api/application-signout",
    )

    // Independent apps are cleared for everyone.
    expect(srcs).toContain("https://payments.uat.test/application-signout")
    expect(srcs).toContain("https://journey.uat.test/application-signout")
    expect(srcs).toContain("https://forms.uat.test/api/application-signout")
  })
})
