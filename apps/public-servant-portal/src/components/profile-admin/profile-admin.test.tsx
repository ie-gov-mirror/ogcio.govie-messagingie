import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  authState,
  env,
  gatewayState,
  getSelectedOrganizationMock,
  guardState,
  organizationIdsForRoleMock,
  persistLastSelectedOrganizationMock,
  pushMock,
  readLastSelectedOrganizationMock,
  searchParams,
  selectOrganizationMock,
  toasterMock,
  trackEventMock,
  updateContextMock,
} = vi.hoisted(() => ({
  authState: {
    user: { sub: "user-1", name: "Alice" } as
      | { sub: string; name?: string; email?: string }
      | undefined,
    claims: {},
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  },
  env: {
    NEXT_PUBLIC_SAG_URL: "https://sag.example",
    NEXT_PUBLIC_PROFILE_URL: "https://profile.example",
    NEXT_PUBLIC_ANALYTICS_URL: undefined as string | undefined,
    NEXT_PUBLIC_ANALYTICS_WEBSITE_ID: "website",
    NEXT_PUBLIC_ANALYTICS_ORGANIZATION_ID: "org",
    NEXT_PUBLIC_ANALYTICS_DRY_RUN: false,
    NEXT_PUBLIC_UNLEASH_URL: undefined as string | undefined,
    NEXT_PUBLIC_UNLEASH_CLIENT_KEY: undefined as string | undefined,
    NEXT_PUBLIC_UNLEASH_APP_NAME: "profile-admin",
  },
  gatewayState: {
    data: undefined as unknown,
    error: undefined as Error | undefined,
    isLoading: false,
  },
  getSelectedOrganizationMock: vi.fn(),
  guardState: { resolved: true, authorized: true },
  organizationIdsForRoleMock: vi.fn(() => ["org-1"]),
  persistLastSelectedOrganizationMock: vi.fn(),
  pushMock: vi.fn(),
  readLastSelectedOrganizationMock: vi.fn(),
  searchParams: new URLSearchParams(),
  selectOrganizationMock: vi.fn(),
  toasterMock: vi.fn(),
  trackEventMock: vi.fn(),
  updateContextMock: vi.fn(),
}))

vi.mock("@/env/env.client", () => ({ env }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}))
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@ogcio/nextjs-analytics", () => ({
  AnalyticsProvider: ({
    children,
    config,
  }: {
    children: React.ReactNode
    config: { baseUrl: string }
  }) => (
    <div data-testid='analytics-provider' data-url={config.baseUrl}>
      {children}
    </div>
  ),
  useAnalytics: () => ({ trackEvent: trackEventMock }),
}))

vi.mock("@unleash/proxy-client-react", () => ({
  FlagProvider: ({
    children,
    config,
  }: {
    children: React.ReactNode
    config: { url: string }
  }) => (
    <div data-testid='flag-provider' data-url={config.url}>
      {children}
    </div>
  ),
  useFlag: () => true,
  useFlagsStatus: () => ({ flagsReady: true }),
  useUnleashContext: () => updateContextMock,
}))

vi.mock("@ogcio/sag-client/react", () => ({
  PROFILE_PUBLIC_SERVANT_ROLE_NAME: "Profile Public Servant",
  SagClientProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useAuth: () => authState,
  useGatewayFetch: () => gatewayState,
  usePublicServantGuard: () => guardState,
  useSagClient: () => ({
    getSelectedOrganization: getSelectedOrganizationMock,
    selectOrganization: selectOrganizationMock,
  }),
}))

vi.mock("@/util/zone", () => ({
  organizationIdsForRole: () => organizationIdsForRoleMock(),
  ZONE_SAG_APP_NAME: { "profile-admin": "profile-admin" },
}))
vi.mock("@/util/profile-admin/last-selected-org", () => ({
  persistLastSelectedOrganization: persistLastSelectedOrganizationMock,
  readLastSelectedOrganization: readLastSelectedOrganizationMock,
}))
vi.mock("@/components/profile-admin/navigation/page-header", () => ({
  PageHeader: ({
    publicName,
    onSignOut,
  }: {
    publicName: string
    onSignOut: () => void
  }) => (
    <button type='button' onClick={onSignOut}>
      {publicName}
    </button>
  ),
}))
vi.mock("@/components/profile-admin/layout/application-footer", () => ({
  ApplicationFooter: () => <footer>footer</footer>,
}))

vi.mock("@ogcio/design-system-react", () => ({
  Container: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Header: ({
    items,
  }: {
    items: {
      label: string
      onClick: (event: { preventDefault: () => void }) => void
    }[]
  }) => (
    <header>
      {items.map((item) => (
        <button
          type='button'
          key={item.label}
          onClick={() => item.onClick({ preventDefault: vi.fn() })}
        >
          {item.label}
        </button>
      ))}
    </header>
  ),
  Heading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  LoadMaterialSymbols: () => null,
  Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Spinner: () => <span data-testid='spinner' />,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SummaryList: ({ children }: { children: React.ReactNode }) => (
    <dl>{children}</dl>
  ),
  SummaryListAction: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SummaryListRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SummaryListValue: ({ children }: { children: React.ReactNode }) => (
    <dd>{children}</dd>
  ),
  ToastProvider: () => null,
  toaster: { create: toasterMock },
}))

import { AnalyticsProviderWrapper } from "./analytics-provider-wrapper"
import { ClientShell } from "./client-shell"
import { FeatureFlagsProvider, useFeatureFlags } from "./feature-flags-provider"
import { MyProfile } from "./my-profile"
import { NotAuthorized } from "./not-authorized"
import { ServerError } from "./server-error"

function FlagValue() {
  return <span>{String(useFeatureFlags().isUserExportEnabled)}</span>
}

describe("profile-admin root components", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    env.NEXT_PUBLIC_ANALYTICS_URL = undefined
    env.NEXT_PUBLIC_UNLEASH_URL = undefined
    env.NEXT_PUBLIC_UNLEASH_CLIENT_KEY = undefined
    authState.user = { sub: "user-1", name: "Alice" }
    authState.loading = false
    guardState.resolved = true
    guardState.authorized = true
    gatewayState.data = undefined
    gatewayState.error = undefined
    gatewayState.isLoading = false
    for (const key of [...searchParams.keys()]) searchParams.delete(key)
    getSelectedOrganizationMock.mockResolvedValue("org-1")
    organizationIdsForRoleMock.mockReturnValue(["org-1"])
    readLastSelectedOrganizationMock.mockReturnValue(undefined)
  })

  it("passes children through when analytics is unconfigured", () => {
    render(<AnalyticsProviderWrapper>content</AnalyticsProviderWrapper>)
    expect(screen.getByText("content")).toBeInTheDocument()
    expect(screen.queryByTestId("analytics-provider")).not.toBeInTheDocument()
  })

  it("configures the analytics provider when enabled", () => {
    env.NEXT_PUBLIC_ANALYTICS_URL = "https://analytics.example"
    render(<AnalyticsProviderWrapper>content</AnalyticsProviderWrapper>)
    expect(screen.getByTestId("analytics-provider")).toHaveAttribute(
      "data-url",
      "https://analytics.example",
    )
  })

  it("uses safe flag defaults without Unleash configuration", () => {
    render(
      <FeatureFlagsProvider>
        <FlagValue />
      </FeatureFlagsProvider>,
    )
    expect(screen.getByText("false")).toBeInTheDocument()
  })

  it("bridges the signed-in user into configured feature flags", async () => {
    env.NEXT_PUBLIC_UNLEASH_URL = "https://flags.example"
    env.NEXT_PUBLIC_UNLEASH_CLIENT_KEY = "key"
    render(
      <FeatureFlagsProvider>
        <FlagValue />
      </FeatureFlagsProvider>,
    )
    expect(screen.getByTestId("flag-provider")).toHaveAttribute(
      "data-url",
      "https://flags.example",
    )
    expect(screen.getByText("true")).toBeInTheDocument()
    await waitFor(() =>
      expect(updateContextMock).toHaveBeenCalledWith({ userId: "user-1" }),
    )
  })

  it("renders the authenticated client shell after organization selection", async () => {
    render(<ClientShell>protected</ClientShell>)
    expect(await screen.findByText("protected")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Alice" })).toBeInTheDocument()
    expect(screen.getByText("footer")).toBeInTheDocument()
    expect(persistLastSelectedOrganizationMock).toHaveBeenCalledWith(
      "user-1",
      "org-1",
    )
  })

  it("shows loading while authorization is unresolved", () => {
    guardState.resolved = false
    render(<ClientShell>protected</ClientShell>)

    expect(screen.getByLabelText("Loading")).toBeInTheDocument()
    expect(screen.queryByText("protected")).not.toBeInTheDocument()
  })

  it("starts sign-in for an unauthenticated visitor", async () => {
    authState.user = undefined
    guardState.authorized = false
    render(<ClientShell>protected</ClientShell>)

    await waitFor(() => expect(authState.signIn).toHaveBeenCalledOnce())
    expect(authState.signIn).toHaveBeenCalledWith({
      redirectUrl: window.location.href,
    })
    expect(document.cookie).toContain("connectorsToShow=ogcio-entraid")
  })

  it("restores the saved eligible organization", async () => {
    organizationIdsForRoleMock.mockReturnValue(["org-1", "org-2"])
    getSelectedOrganizationMock.mockResolvedValue(null)
    readLastSelectedOrganizationMock.mockReturnValue("org-2")
    selectOrganizationMock.mockResolvedValue(true)

    render(<ClientShell>protected</ClientShell>)
    expect(await screen.findByText("protected")).toBeInTheDocument()

    expect(selectOrganizationMock).toHaveBeenCalledWith("org-2")
    expect(persistLastSelectedOrganizationMock).toHaveBeenCalledWith(
      "user-1",
      "org-2",
    )
  })

  it("falls back to the first eligible organization", async () => {
    getSelectedOrganizationMock.mockResolvedValue("other-org")
    readLastSelectedOrganizationMock.mockReturnValue("missing-org")
    selectOrganizationMock.mockResolvedValue(true)

    render(<ClientShell>protected</ClientShell>)
    expect(await screen.findByText("protected")).toBeInTheDocument()

    expect(selectOrganizationMock).toHaveBeenCalledWith("org-1")
  })

  it("keeps protected content gated when organization selection fails", async () => {
    getSelectedOrganizationMock.mockResolvedValue(null)
    selectOrganizationMock.mockResolvedValue(false)

    render(<ClientShell>protected</ClientShell>)

    await waitFor(() => expect(selectOrganizationMock).toHaveBeenCalledOnce())
    expect(screen.queryByText("protected")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Loading")).toBeInTheDocument()
    expect(persistLastSelectedOrganizationMock).not.toHaveBeenCalled()
  })

  it("keeps loading until an eligible organization exists", () => {
    organizationIdsForRoleMock.mockReturnValue([])
    render(<ClientShell>protected</ClientShell>)

    expect(screen.getByLabelText("Loading")).toBeInTheDocument()
  })

  it("uses the account email as the display name fallback", async () => {
    authState.user = { sub: "user-1", email: "alice@example.com" }
    render(<ClientShell>protected</ClientShell>)

    expect(
      await screen.findByRole("button", { name: "alice@example.com" }),
    ).toBeInTheDocument()
  })

  it("renders the forbidden shell and signs out", async () => {
    guardState.authorized = false
    render(<ClientShell>protected</ClientShell>)
    expect(await screen.findByText("title")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "drawer.link.logout" }))
    expect(authState.signOut).toHaveBeenCalledOnce()
  })

  it("renders profile details and masks PPSN by default", () => {
    gatewayState.data = {
      email: "alice@example.com",
      details: { firstName: "Alice", lastName: "Doe", ppsn: "1234567A" },
    }
    render(<MyProfile />)
    expect(screen.getByText("alice@example.com")).toBeInTheDocument()
    expect(screen.queryByText("1234567A")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "clickToReveal" })).toHaveAttribute(
      "href",
      "?ppsn=1",
    )
  })

  it("renders the not-authorized message", () => {
    render(<NotAuthorized />)
    expect(screen.getByText("title")).toBeInTheDocument()
    expect(screen.getByText("description")).toBeInTheDocument()
  })

  it("reports, displays, and redirects server errors", async () => {
    render(<ServerError error='failed' redirectTo='/retry' />)
    expect(screen.getByText("failed")).toBeInTheDocument()
    await waitFor(() => expect(trackEventMock).toHaveBeenCalledOnce())
    expect(toasterMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: "failed", variant: "danger" }),
    )
    expect(pushMock).toHaveBeenCalledWith("/retry")
  })
})
