import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const trackEvent = vi.hoisted(() => vi.fn())
const capturedEvents = vi.hoisted(
  () =>
    ({}) as {
      onConsentDecision?: (accepted: boolean) => void
      onConsentError?: (error: string) => void
    },
)
const sagProvider = vi.hoisted(() => ({
  appName: "",
  renderChildren: true,
  onSessionExpired: undefined as (() => void) | undefined,
}))
const shellState = vi.hoisted(() => ({
  path: "/en/messages",
  onboardingResolved: true,
}))
const authState = vi.hoisted(() => ({
  user: undefined as { id: string } | undefined,
  claims: undefined as
    | {
        roles?: string[]
        organization_roles: string[]
        organizations: string[]
        signinMethod?: string
      }
    | undefined,
  loading: false,
  signIn: vi.fn(),
  signOut: vi.fn(),
  invalidateSession: vi.fn().mockResolvedValue(undefined),
}))
const sagSignIn = vi.hoisted(() => vi.fn())

vi.mock("@ogcio/nextjs-analytics", () => ({
  useAnalytics: () => ({ trackEvent }),
}))
vi.mock("@ogcio/consent/react", () => ({
  FORCE_CONSENT_PARAM: "force-consent",
  MESSAGING_CONSENT_SUBJECT: "messaging",
  ConsentProvider: ({
    children,
    events,
  }: {
    children: ReactNode
    events: {
      onConsentDecision: (accepted: boolean) => void
      onConsentError: (error: string) => void
    }
  }) => {
    capturedEvents.onConsentDecision = events.onConsentDecision
    capturedEvents.onConsentError = events.onConsentError
    return <>{children}</>
  },
}))
vi.mock("@grafana/faro-web-sdk", () => ({
  faro: { api: { pushLog: vi.fn() } },
  LogLevel: { WARN: "warn", ERROR: "error" },
}))
// client-shell.tsx module-level imports pull in `@ogcio/sag-client/react`
// (for AuthenticatedShell/useOnboardingGuard, not used by ConsentFlow
// itself); the real package fails to resolve its `onboarding` submodule
// under vitest's resolver, so it must be stubbed regardless.
vi.mock("@ogcio/sag-client/react", () => ({
  CONNECTOR_MYGOVID: "mygovid",
  ROLE_NAME_ONBOARDED_CITIZEN: "Onboarded citizen",
  // ZONE_CONFIG (imported transitively via client-shell.tsx) pulls in these
  // role constants — stub them so the per-zone table loads under vitest.
  MESSAGING_PUBLIC_SERVANT_ROLE_NAME: "Messaging Public Servant",
  PROFILE_PUBLIC_SERVANT_ROLE_NAME: "Profile Public Servant",
  DASHBOARD_PUBLIC_SERVANT_ROLE_NAME: "Dashboard Public Servant",
  useAuth: () => authState,
  useOnboardingGuard: () => ({ resolved: shellState.onboardingResolved }),
}))
vi.mock("@ogcio/sag-client", () => ({
  signIn: sagSignIn,
}))
// `@/i18n/navigation` wraps next-intl's `createNavigation`, which pulls in
// `next/navigation` in a way that doesn't resolve under vitest — stub the
// one export client-shell.tsx uses (`useRouter`, only called by
// `AuthenticatedShell`, not by `ConsentFlow`).
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock("next/navigation", () => ({
  usePathname: () => shellState.path,
}))
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))
vi.mock("@citizen-portal/shared", () => ({
  CitizenSagProvider: ({
    appName,
    children,
    onSessionExpired,
  }: {
    appName: string
    children: ReactNode
    onSessionExpired: () => void
  }) => {
    sagProvider.appName = appName
    sagProvider.onSessionExpired = onSessionExpired
    return sagProvider.renderChildren ? (
      <>{children}</>
    ) : (
      <div data-testid='sag-provider' />
    )
  },
  getEnv: () => ({ sagUrl: "http://sag.local.test", sagAppName: "messaging" }),
  useCrossZoneLink: () => (_zone: string, path: string) => path,
}))
// AnnouncementsFlow pulls in `@ogcio/consent/react`'s `useConsent`, which the
// mock above doesn't provide — stub the component itself as a passthrough,
// matching the "mock the neighbour component" idiom used elsewhere in this
// test suite (see announcements-flow.test.tsx for the real component's own
// coverage).
vi.mock("@/components/announcements-flow", () => ({
  AnnouncementsFlow: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/analytics/login-tracker", () => ({
  LoginTracker: () => null,
}))
vi.mock("@/components/analytics-provider", () => ({
  AnalyticsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/feature-flags-provider", () => ({
  FeatureFlagsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/consent-banner", () => ({
  ConsentBanner: () => <div>consent banner</div>,
}))
vi.mock("@/components/layout/application-footer", () => ({
  ApplicationFooter: () => <footer>footer</footer>,
}))
vi.mock("@/components/layout/containers", () => ({
  AppMainContent: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock("@/components/load-material-symbols", () => ({
  LoadMaterialSymbols: () => null,
}))
vi.mock("@/components/navigation/page-header", () => ({
  PageHeader: () => <header>header</header>,
}))
vi.mock("@/components/navigation/app-side-nav", () => ({
  AppSideNav: () => null,
}))
vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div>loading</div>,
}))
vi.mock("@/components/public-name", () => ({
  PublicName: () => <span>name</span>,
}))
vi.mock("@/components/shell-loading-chrome", () => ({
  ShellLoadingChrome: ({ zone }: { zone: string }) => <div>loading {zone}</div>,
}))
vi.mock("@/components/messages/unified-inbox", () => ({}))
vi.mock("@/components/secure-messages/secure-message-page", () => ({}))
vi.mock("@/components/dashboard/my-dashboard", () => ({}))
vi.mock("@/components/submissions/submissions", () => ({}))
vi.mock("@/components/profile/my-profile", () => ({}))
vi.mock("@/hooks/use-idle-mount", () => ({
  useIdleMount: () => true,
}))

import { ClientShell, ConsentFlow } from "@/components/client-shell"

describe("ConsentFlow analytics", () => {
  beforeEach(() => trackEvent.mockClear())

  it("fires consent-accepted on an accepting decision", () => {
    render(
      <ConsentFlow locale='en' onLocaleChange={() => {}}>
        {null}
      </ConsentFlow>,
    )
    capturedEvents.onConsentDecision?.(true)
    expect(trackEvent).toHaveBeenCalledWith({
      event: {
        name: "consent-accepted",
        category: "Consent",
        action: "Consent Accepted",
      },
    })
  })

  it("fires consent-declined on a declining decision", () => {
    render(
      <ConsentFlow locale='en' onLocaleChange={() => {}}>
        {null}
      </ConsentFlow>,
    )
    capturedEvents.onConsentDecision?.(false)
    expect(trackEvent).toHaveBeenCalledWith({
      event: {
        name: "consent-declined",
        category: "Consent",
        action: "Consent Declined",
      },
    })
  })

  it("clears forced consent after a decision and reports consent errors", () => {
    window.history.replaceState(null, "", "/en/messages?force-consent=1")
    render(
      <ConsentFlow locale='en' onLocaleChange={() => {}}>
        {null}
      </ConsentFlow>,
    )

    capturedEvents.onConsentDecision?.(true)
    capturedEvents.onConsentError?.("unavailable")

    expect(window.location.search).toBe("")
  })
})

describe("ClientShell", () => {
  beforeEach(() => {
    sagProvider.renderChildren = true
    shellState.path = "/en/messages"
    shellState.onboardingResolved = true
    authState.user = undefined
    authState.claims = undefined
    authState.loading = false
    authState.signIn.mockClear()
    authState.signOut.mockClear()
    authState.invalidateSession.mockReset()
    authState.invalidateSession.mockResolvedValue(undefined)
    sagSignIn.mockClear()
    sessionStorage.clear()
  })

  it("configures the SAG provider for the active zone", () => {
    sagProvider.renderChildren = false

    render(<ClientShell>content</ClientShell>)

    expect(screen.getByTestId("sag-provider")).toBeInTheDocument()
    expect(sagProvider.appName).toBe("messaging")
    sagProvider.renderChildren = true
  })

  it("starts sign-in when authentication resolves without a user", () => {
    render(<ClientShell>content</ClientShell>)

    expect(authState.signIn).toHaveBeenCalledWith({
      connector: "mygovid",
      redirectUrl: window.location.href,
    })
    expect(screen.getByText("loading messages")).toBeInTheDocument()
  })

  it("shows loading chrome until onboarding resolves", () => {
    shellState.onboardingResolved = false
    render(<ClientShell>content</ClientShell>)

    expect(screen.getByText("loading messages")).toBeInTheDocument()
  })

  it("renders an authenticated profile shell without messaging consent", () => {
    shellState.path = "/en/profile"
    authState.user = { id: "user-1" }
    authState.claims = {
      roles: ["Onboarded citizen"],
      organization_roles: [],
      organizations: [],
    }
    render(<ClientShell>content</ClientShell>)

    expect(screen.getByText("content")).toBeInTheDocument()
    expect(screen.queryByText("consent banner")).not.toBeInTheDocument()
    expect(screen.getByText("footer")).toBeInTheDocument()
  })

  it("renders the dashboard zone", () => {
    shellState.path = "/en/dashboard"
    authState.user = { id: "user-1" }
    authState.claims = {
      roles: ["Onboarded citizen"],
      organization_roles: [],
      organizations: [],
    }
    render(<ClientShell>dashboard content</ClientShell>)

    expect(sagProvider.appName).toBe("dashboard")
    expect(screen.getByText("dashboard content")).toBeInTheDocument()
  })

  it("renders messaging consent for an onboarded citizen", () => {
    authState.user = { id: "user-1" }
    authState.claims = {
      roles: ["Onboarded citizen"],
      organization_roles: [],
      organizations: [],
    }
    render(<ClientShell>content</ClientShell>)

    expect(screen.getByText("consent banner")).toBeInTheDocument()
    expect(screen.getByText("content")).toBeInTheDocument()
  })

  it("refreshes stale citizen claims once", () => {
    authState.user = { id: "user-1" }
    authState.claims = {
      roles: [],
      organization_roles: [],
      organizations: [],
      signinMethod: "mygovid",
    }
    render(<ClientShell>content</ClientShell>)

    expect(authState.invalidateSession).toHaveBeenCalledOnce()
    expect(
      sessionStorage.getItem("citizen_portal_stale_claims_refreshed"),
    ).not.toBeNull()
    expect(screen.getByText("loading")).toBeInTheDocument()
  })

  it("does not repeat a stale-claims refresh", () => {
    sessionStorage.setItem("citizen_portal_stale_claims_refreshed", "123")
    authState.user = { id: "user-1" }
    authState.claims = {
      roles: [],
      organization_roles: [],
      organizations: [],
    }
    render(<ClientShell>content</ClientShell>)

    expect(authState.invalidateSession).not.toHaveBeenCalled()
    expect(screen.getByText("content")).toBeInTheDocument()
  })

  it("clears the refresh marker after claims recover", () => {
    sessionStorage.setItem("citizen_portal_stale_claims_refreshed", "123")
    authState.user = { id: "user-1" }
    authState.claims = {
      roles: ["Onboarded citizen"],
      organization_roles: [],
      organizations: ["org-1"],
    }
    render(<ClientShell>content</ClientShell>)

    expect(
      sessionStorage.getItem("citizen_portal_stale_claims_refreshed"),
    ).toBeNull()
  })

  it("does not refresh public-servant claims", () => {
    authState.user = { id: "user-1" }
    authState.claims = {
      roles: [],
      organization_roles: ["Public Servant"],
      organizations: ["org-1"],
    }
    render(<ClientShell>content</ClientShell>)

    expect(authState.invalidateSession).not.toHaveBeenCalled()
    expect(screen.getByText("content")).toBeInTheDocument()
  })

  it("hard-signs in again when the SAG session expires", () => {
    sagProvider.renderChildren = false
    render(<ClientShell>content</ClientShell>)

    sagProvider.onSessionExpired?.()

    expect(sagSignIn).toHaveBeenCalledWith(
      "http://sag.local.test",
      "messaging",
      {
        connector: "mygovid",
        redirectUrl: window.location.href,
      },
    )
  })
})
