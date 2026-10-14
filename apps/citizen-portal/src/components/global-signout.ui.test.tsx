import { beforeEach, describe, expect, it, vi } from "vitest"

// Cross-block sign-out fan-out is gated per integration (AB#39580): a
// deployment that ships without Payments / Journey-Builder must not fan
// a sign-out iframe out to that origin (which both references the absent
// block and would hang on an unreachable host).
const flagState = vi.hoisted(() => ({
  journey: true,
  payments: true,
  forms: true,
}))
vi.mock("@/lib/feature-config", () => ({
  isJourneyIntegrationEnabled: () => flagState.journey,
  isPaymentsIntegrationEnabled: () => flagState.payments,
  isFormsIntegrationEnabled: () => flagState.forms,
}))

vi.mock("@/lib/zone-config", () => ({
  ZONE_CONFIG: {
    messages: { sagAppName: "messaging" },
    profile: { sagAppName: "profile" },
    dashboard: { sagAppName: "dashboard" },
  },
}))

vi.mock("@citizen-portal/shared", () => ({
  getEnv: vi.fn(() => ({ sagUrl: "http://sag.test", sagAppName: "messaging" })),
}))

vi.mock("@/util/get-zone-from-origin", () => ({
  getZoneFromOrigin: vi.fn(() => "profile" as const),
}))

import { getEnv } from "@citizen-portal/shared"
import { getZoneFromOrigin } from "@/util/get-zone-from-origin"

const envHolder = vi.hoisted(() => ({
  value: {
    NEXT_PUBLIC_MYGOVID_END_SESSION_URL: undefined as string | undefined,
    NEXT_PUBLIC_PAYMENTS_URL: "http://payments.test",
    NEXT_PUBLIC_JOURNEY_URL: "http://journey.test",
    NEXT_PUBLIC_FORMS_URL: "http://forms.test",
    NEXT_PUBLIC_DASHBOARD_ADMIN_URL: "http://dashboard-admin.test",
    NEXT_PUBLIC_PROFILE_ADMIN_URL: "http://profile-admin.test",
    NEXT_PUBLIC_MESSAGING_ADMIN_URL: "http://messaging-admin.test",
    NEXT_PUBLIC_BASE_URL: "http://messaging.test",
  },
}))
vi.mock("@/env/env.client", () => ({
  get env() {
    return envHolder.value
  },
}))

const MYGOVID_END_SESSION_URL =
  "https://nonprod-account.mygovid-nonprod.ie/policy/oauth2/v2.0/logout"

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@ogcio/design-system-react", () => ({
  Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Spinner: () => <div />,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import {
  buildIframeUrlList,
  resolveGatewaySignOutAppName,
} from "@/components/global-signout"

const PAYMENTS_SIGNOUT = "http://payments.test/application-signout"
const JOURNEY_SIGNOUT = "http://journey.test/application-signout"
const FORMS_SIGNOUT = "http://forms.test/api/application-signout"
const CLEAR_SESSION = "http://sag.test/auth/clear-session"

describe("resolveGatewaySignOutAppName", () => {
  it("returns the env app name for standalone deployments", () => {
    vi.mocked(getEnv).mockReturnValue({
      sagUrl: "http://sag.test",
      sagAppName: "messaging",
      hosts: {
        messages: "http://messaging.test",
        profile: "http://profile.test",
        dashboard: "http://dashboard.test",
      },
    })
    expect(resolveGatewaySignOutAppName()).toBe("messaging")
  })

  it("maps consolidated citizen-portal from NEXT_PUBLIC_BASE_URL to the zone SAG app", () => {
    vi.mocked(getEnv).mockReturnValue({
      sagUrl: "http://sag.test",
      sagAppName: "citizen-portal",
      hosts: {
        messages: "http://messaging.test",
        profile: "http://profile.test",
        dashboard: "http://dashboard.test",
      },
    })
    envHolder.value.NEXT_PUBLIC_BASE_URL = "http://messaging.test"
    expect(resolveGatewaySignOutAppName()).toBe("messaging")
  })

  it("falls back to hostname zone when BASE_URL does not match a zone host", () => {
    vi.mocked(getEnv).mockReturnValue({
      sagUrl: "http://sag.test",
      sagAppName: "citizen-portal",
      hosts: {
        messages: "http://messaging.test",
        profile: "http://profile.test",
        dashboard: "http://dashboard.test",
      },
    })
    envHolder.value.NEXT_PUBLIC_BASE_URL = "http://unknown.test"
    vi.mocked(getZoneFromOrigin).mockReturnValue("profile")
    expect(resolveGatewaySignOutAppName()).toBe("profile")
  })
})

describe("buildIframeUrlList — cross-block fan-out gating (AB#39580)", () => {
  beforeEach(() => {
    flagState.journey = true
    flagState.payments = true
    flagState.forms = true
    envHolder.value.NEXT_PUBLIC_MYGOVID_END_SESSION_URL = undefined
  })

  // AB#39676: the MyGovID (Azure B2C) end-session is a cross-site logout that
  // CANNOT be cleared from a hidden iframe, so it must never appear in the
  // iframe fan-out — it is handled via a top-level navigation instead.
  it("never includes the MyGovID end-session in the iframe list", () => {
    envHolder.value.NEXT_PUBLIC_MYGOVID_END_SESSION_URL =
      MYGOVID_END_SESSION_URL
    const urls = buildIframeUrlList("citizen")
    expect(urls).not.toContain(MYGOVID_END_SESSION_URL)
  })

  it("includes Payments, Journey-Builder, and Forms sign-out by default (citizen)", () => {
    const urls = buildIframeUrlList("citizen")
    expect(urls).toContain(PAYMENTS_SIGNOUT)
    expect(urls).toContain(JOURNEY_SIGNOUT)
    expect(urls).toContain(FORMS_SIGNOUT)
    // The shared SAG session is always cleared.
    expect(urls).toContain(CLEAR_SESSION)
  })

  it("omits the Journey-Builder iframe when journey integration is disabled", () => {
    flagState.journey = false
    const urls = buildIframeUrlList("citizen")
    expect(urls).not.toContain(JOURNEY_SIGNOUT)
    expect(urls).toContain(PAYMENTS_SIGNOUT)
    expect(urls).toContain(FORMS_SIGNOUT)
    expect(urls).toContain(CLEAR_SESSION)
  })

  it("omits the Payments iframe when payments integration is disabled", () => {
    flagState.payments = false
    const urls = buildIframeUrlList("citizen")
    expect(urls).not.toContain(PAYMENTS_SIGNOUT)
    expect(urls).toContain(JOURNEY_SIGNOUT)
    expect(urls).toContain(FORMS_SIGNOUT)
    expect(urls).toContain(CLEAR_SESSION)
  })

  it("omits the Forms iframe when forms integration is disabled", () => {
    flagState.forms = false
    const urls = buildIframeUrlList("citizen")
    expect(urls).not.toContain(FORMS_SIGNOUT)
    expect(urls).toContain(JOURNEY_SIGNOUT)
    expect(urls).toContain(PAYMENTS_SIGNOUT)
    expect(urls).toContain(CLEAR_SESSION)
  })

  it("omits all when neither integration is shipped, still clears the SAG session", () => {
    flagState.journey = false
    flagState.payments = false
    flagState.forms = false
    const urls = buildIframeUrlList("citizen")
    expect(urls).not.toContain(PAYMENTS_SIGNOUT)
    expect(urls).not.toContain(JOURNEY_SIGNOUT)
    expect(urls).not.toContain(FORMS_SIGNOUT)
    expect(urls).toContain(CLEAR_SESSION)
  })

  it("does not leak the gating into the public-servant admin fan-out", () => {
    // Public servants additionally clear their admin sessions; the
    // payments/journey/forms gating is orthogonal to that branch.
    flagState.journey = false
    flagState.payments = false
    flagState.forms = false
    const urls = buildIframeUrlList("publicServant")
    expect(urls.some((u) => u.startsWith("http://dashboard-admin.test"))).toBe(
      true,
    )
    expect(urls).toContain(CLEAR_SESSION)
  })
})
