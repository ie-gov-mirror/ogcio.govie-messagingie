import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// @ogcio/sag-client/react ships re-exports via extension-less relative
// imports that Node ESM rejects under vitest. The header touches it
// only transitively through ZONE_CONFIG (role-name constants); stub
// just those two values so the import resolves.
vi.mock("@ogcio/sag-client/react", () => ({
  MESSAGING_PUBLIC_SERVANT_ROLE_NAME: "Messaging Public Servant",
  PROFILE_PUBLIC_SERVANT_ROLE_NAME: "Profile Public Servant",
  DASHBOARD_PUBLIC_SERVANT_ROLE_NAME: "Dashboard Public Servant",
}))

let mockPathname = "/en/messages"
let mockLocale: "en" | "ga" = "en"

// `usePathname` drives the active zone resolution + the language-href
// builder; the stub lets each spec pin the path without touching JSDOM's
// history API.
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("next-intl", () => ({
  useLocale: () => mockLocale,
  useTranslations: (namespace: string) => (key: string) => {
    // Mirror the relevant entries from src/messages/en.json so the
    // header renders the same strings the bundle ships. The fallback
    // returns `${namespace}.${key}` so a typo in the test or a
    // missed-translation regression in the component surfaces as a
    // visible string mismatch rather than a passing test.
    const TITLE = {
      messages: "MessagingIE",
      profile: "My Profile",
      dashboard: "Dashboard",
    } as const
    const HEADER = {
      menu: "Menu",
      onboarding: "Onboarding",
      "drawer.close": "Close",
      greetingPrefix: "Hi,",
      profile: "Profile",
      "language.english": "English",
      "language.irish": "Gaeilge",
    } as const
    const DRAWER = {
      dashboard: "Dashboard",
      messages: "Messages",
      lifeEvents: "Life events",
      applications: "Applications",
      close: "Close",
    } as const
    const USER_MENU = { logout: "Logout" } as const
    if (namespace === "navigation.title") {
      return TITLE[key as keyof typeof TITLE] ?? `${namespace}.${key}`
    }
    if (namespace === "navigation.header") {
      return HEADER[key as keyof typeof HEADER] ?? `${namespace}.${key}`
    }
    if (namespace === "navigation.header.drawer") {
      return DRAWER[key as keyof typeof DRAWER] ?? `${namespace}.${key}`
    }
    if (namespace === "navigation.userMenu") {
      return USER_MENU[key as keyof typeof USER_MENU] ?? `${namespace}.${key}`
    }
    if (namespace === "home.folders" && key === "unreadBadge") {
      return "1 unread message"
    }
    return `${namespace}.${key}`
  },
}))

vi.mock("@/hooks/use-show-application-links", () => ({
  useShowApplicationLinks: () => true,
}))

// Drive the deployment-topology flags directly so the suite can assert
// the cross-zone drawer links are gated per zone (AB#39580) without
// loading the real env schema. `getEnabledLandingZone` is stubbed to the
// identity fallback used by `getZoneFromPath` for unmatched paths.
const flagState = vi.hoisted(() => ({
  dashboard: true,
  messages: true,
  lea: false,
  journey: true,
}))
vi.mock("@/lib/feature-config", () => ({
  isZoneEnabled: (zone: "messages" | "profile" | "dashboard") => {
    if (zone === "profile") return true
    if (zone === "dashboard") return flagState.dashboard
    return flagState.messages
  },
  getEnabledLandingZone: (zone: "messages" | "profile" | "dashboard") => zone,
  isLeaEnabled: () => flagState.lea,
  isJourneyIntegrationEnabled: () => flagState.journey,
}))

vi.mock("@/components/messages/use-inbox-unread-count", () => ({
  useInboxUnreadCount: () => ({ count: 1, isLoading: false }),
}))

vi.mock("@/components/messages/inbox-unread-badge", () => ({
  InboxUnreadBadge: () => <span data-testid='unread-badge' />,
}))

// `useCrossZoneLink` and the `ZONE_CONFIG` table are exercised by their
// own dedicated suites; here we only need the (zone,path) -> absolute-
// URL contract so we can assert the rendered hrefs. Returning the
// deterministic local-docker triple makes every assertion a string-
// equality check.
vi.mock("@citizen-portal/shared", () => ({
  useEnv: () => ({
    hosts: {
      messages: "http://messaging.local.test:8080",
      profile: "http://profile.local.test:8080",
      dashboard: "http://dashboard.local.test:8080",
    },
  }),
  useCrossZoneLink:
    () => (zone: "messages" | "profile" | "dashboard", p: string) => {
      const base = {
        messages: "http://messaging.local.test:8080",
        profile: "http://profile.local.test:8080",
        dashboard: "http://dashboard.local.test:8080",
      } as const
      return `${base[zone]}${p.startsWith("/") ? p : `/${p}`}`
    },
}))

// DS exports a wide surface; the cheapest path is to stub every component
// the header touches as a passthrough that preserves children only. We
// deliberately do NOT forward arbitrary props onto the resulting <div>
// — DS components consume camelCase props (closeButtonLabel,
// showItemMode, …) that React warns about when they reach DOM nodes.
// The test asserts on visible text + role/href on links, never on the
// internal DS prop surface, so stripping props is safe and quieter.
vi.mock("@ogcio/design-system-react", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children as React.ReactNode}</div>
  )
  return {
    HeaderNext: Pass,
    HeaderLogo: Pass,
    HeaderTitle: Pass,
    HeaderPrimaryMenu: Pass,
    HeaderSecondaryMenu: Pass,
    HeaderMenuItemSlot: Pass,
    HeaderMenuItemButton: ({
      children,
      onClick,
    }: {
      children: React.ReactNode
      onClick?: () => void
    }) => (
      <button type='button' onClick={onClick}>
        {children}
      </button>
    ),
    HeaderMenuItemLink: ({
      href,
      children,
    }: {
      href: string
      children: React.ReactNode
    }) => <a href={href}>{children}</a>,
    DrawerWrapper: Pass,
    DrawerBody: Pass,
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
      <a href={href}>{children}</a>
    ),
    // ListItem is the DS drawer nav primitive (AB#41657). Its real
    // surface is a styled anchor (`gi-list-item`); the stub only cares
    // about exposing an anchor the role-based queries can find.
    ListItem: ({ href, label }: { href: string; label: string }) => (
      <a href={href}>{label}</a>
    ),
  }
})

vi.mock("@ogcio/design-system-react/logos", () => ({
  LogoHarpWhite: () => <span data-testid='logo-harp' />,
  LogoWhite: () => <span data-testid='logo-white' />,
}))

vi.mock("@/components/navigation/user-menu-drawer", () => ({
  UserMenuDrawer: ({
    profileHref,
    children,
    name,
  }: {
    profileHref: string
    children: React.ReactNode
    name: string
  }) => (
    <div data-testid='user-menu-drawer'>
      <span data-testid='user-name'>{name}</span>
      <a data-testid='profile-href' href={profileHref}>
        Profile
      </a>
      {children}
    </div>
  ),
}))

import { PageHeader } from "@/components/navigation/page-header"

describe("PageHeader", () => {
  beforeEach(() => {
    mockPathname = "/en/messages"
    mockLocale = "en"
    flagState.dashboard = true
    flagState.messages = true
    flagState.lea = false
    flagState.journey = true
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("uses the zone name as the logo label and Messages in the drawer", () => {
    mockPathname = "/en/messages"
    render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
    expect(screen.getByRole("link", { name: "MessagingIE" })).toHaveAttribute(
      "href",
      "/en/messages",
    )
    expect(screen.getByRole("link", { name: /Messages/ })).toHaveAttribute(
      "href",
      "/en/messages",
    )
    expect(
      screen.queryByRole("button", { name: "Logout" }),
    ).not.toBeInTheDocument()
    expect(
      screen
        .getAllByRole("link", { name: "Profile" })
        .some((link) => link.getAttribute("data-testid") !== "profile-href"),
    ).toBe(false)
  })

  it("resolves the logo label from the active zone on a profile path", () => {
    mockPathname = "/en/my-profile"
    render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
    expect(screen.getByRole("link", { name: "My Profile" })).toHaveAttribute(
      "href",
      "/en/my-profile",
    )
  })

  it("resolves the title from the active zone on a dashboard path", () => {
    mockPathname = "/en/my-dashboard"
    render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0)
  })

  it("honours an explicit title override (used by onboarding shell)", () => {
    mockPathname = "/onboarding"
    render(
      <PageHeader publicName='Jane' onSignOut={() => {}} title='Onboarding' />,
    )
    expect(screen.getByText("Onboarding")).toBeInTheDocument()
  })

  it("uses ZONE_CONFIG[zone].rootPath as the logo link target", () => {
    mockPathname = "/en/my-profile"
    render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
    // logoHref default is `/${locale}${rootPath}`; profile zone's
    // rootPath is `/my-profile` per ZONE_CONFIG. The matching link
    // is the one with the aria-label === title (set by the logo
    // anchor); the cross-zone drawer link for profile points at the
    // absolute profile host instead.
    const profileLogo = screen
      .getAllByRole("link", { name: "My Profile" })
      .find((a) => a.getAttribute("href") === "/en/my-profile")
    expect(profileLogo).toBeDefined()
  })

  it("produces absolute cross-zone hrefs for the drawer items", () => {
    mockPathname = "/en/messages"
    render(<PageHeader publicName='Jane' onSignOut={() => {}} />)

    // The profile drawer link is rendered via UserMenuDrawer; the
    // dashboard + messaging drawer links are rendered as <ListItem>
    // children inside the drawer body. Every cross-zone href must be
    // absolute — the canonicalisation map is the safety net, but the
    // rendered URL should already point at the canonical host so a
    // hover-preview matches the eventual landing page.
    expect(screen.getByTestId("profile-href")).toHaveAttribute(
      "href",
      "http://profile.local.test:8080/en/my-profile",
    )
    // Two links carry text "Dashboard" / "MessagingIE" on a messages
    // page (logo + drawer); the cross-zone one is the absolute URL.
    const dashboardCrossZone = screen
      .getAllByRole("link", { name: "Dashboard" })
      .find((a) =>
        a.getAttribute("href")?.startsWith("http://dashboard.local.test:8080/"),
      )
    expect(dashboardCrossZone).toBeDefined()
    expect(dashboardCrossZone).toHaveAttribute(
      "href",
      "http://dashboard.local.test:8080/en/my-dashboard",
    )

    // Already on the messages host, so this item is a same-origin path
    // and the shell stays mounted. Dashboard above stays absolute.
    expect(screen.getByRole("link", { name: /Messages/ })).toHaveAttribute(
      "href",
      "/en/messages",
    )
  })

  it("does not list What's new in the drawer (footer only, AB#42591)", () => {
    mockPathname = "/en/messages"
    render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
    expect(
      screen.queryByRole("link", { name: "What's new" }),
    ).not.toBeInTheDocument()
  })

  it("uses the URL locale for cross-zone drawer hrefs when the path is /ga/", () => {
    mockPathname = "/ga/messages"
    mockLocale = "en"
    render(<PageHeader publicName='Jane' onSignOut={() => {}} />)

    expect(screen.getByTestId("profile-href")).toHaveAttribute(
      "href",
      "http://profile.local.test:8080/ga/my-profile",
    )
    const dashboardCrossZone = screen
      .getAllByRole("link", { name: "Dashboard" })
      .find((a) =>
        a.getAttribute("href")?.startsWith("http://dashboard.local.test:8080/"),
      )
    expect(dashboardCrossZone).toHaveAttribute(
      "href",
      "http://dashboard.local.test:8080/ga/my-dashboard",
    )
    expect(screen.getByRole("link", { name: /Messages/ })).toHaveAttribute(
      "href",
      "/ga/messages",
    )
  })

  it("builds the language-switch href by swapping the locale segment on a localed path", () => {
    mockPathname = "/en/my-profile"
    mockLocale = "en"
    render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
    // The secondary-menu link carries the locale-flip target. Two
    // matches expected (header + drawer); either is fine for the
    // contract assertion.
    const gaeilge = screen.getAllByRole("link", { name: "Gaeilge" })[0]
    expect(gaeilge).toHaveAttribute("href", "/ga/my-profile")
  })

  it("falls back to the bare opposite-locale path for no-locale routes", () => {
    // /onboarding has no /{locale}/ segment to swap; the helper must
    // hand back `/ga` (or `/en`) without crashing on the regex
    // replacement. This is the case the onboarding shell hits.
    mockPathname = "/onboarding"
    mockLocale = "en"
    render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
    const gaeilge = screen.getAllByRole("link", { name: "Gaeilge" })[0]
    expect(gaeilge).toHaveAttribute("href", "/ga")
  })

  it("honours an explicit languageHref override (used by no-locale callsites)", () => {
    mockPathname = "/onboarding"
    render(
      <PageHeader
        publicName='Jane'
        onSignOut={() => {}}
        languageHref='/onboarding?ga'
      />,
    )
    const gaeilge = screen.getAllByRole("link", { name: "Gaeilge" })[0]
    expect(gaeilge).toHaveAttribute("href", "/onboarding?ga")
  })

  describe("deployment-topology gating (AB#39580)", () => {
    // The cross-zone drawer items must disappear when their zone is not
    // part of the deployment, so a standalone build never surfaces a link
    // to a building block it doesn't ship.
    const dashboardCrossZoneLink = () =>
      screen
        .queryAllByRole("link", { name: "Dashboard" })
        .find((a) =>
          a
            .getAttribute("href")
            ?.startsWith("http://dashboard.local.test:8080/"),
        )

    const messagingCrossZoneLink = () =>
      screen
        .queryAllByRole("link", { name: /Messages/ })
        .find((a) =>
          a
            .getAttribute("href")
            ?.startsWith("http://messaging.local.test:8080/"),
        )

    it("shows both cross-zone links when every zone is enabled", () => {
      mockPathname = "/en/my-profile"
      render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
      expect(dashboardCrossZoneLink()).toBeDefined()
      expect(messagingCrossZoneLink()).toBeDefined()
    })

    it("hides the Dashboard link when the dashboard zone is disabled", () => {
      flagState.dashboard = false
      mockPathname = "/en/my-profile"
      render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
      expect(dashboardCrossZoneLink()).toBeUndefined()
      // Messaging stays — disabling one zone must not affect the other.
      expect(messagingCrossZoneLink()).toBeDefined()
    })

    it("hides the MessagingIE link when the messages zone is disabled", () => {
      flagState.messages = false
      mockPathname = "/en/my-profile"
      render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
      expect(messagingCrossZoneLink()).toBeUndefined()
      expect(dashboardCrossZoneLink()).toBeDefined()
    })

    it("shows the Profile action and LEA destinations when LEA is on", () => {
      flagState.lea = true
      mockPathname = "/en/messages"
      render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
      expect(
        screen
          .getAllByRole("link", { name: "Profile" })
          .find((link) => link.getAttribute("data-testid") !== "profile-href"),
      ).toHaveAttribute("href", "http://profile.local.test:8080/en/my-profile")
      expect(screen.getByRole("link", { name: "Life events" })).toBeInTheDocument()
      expect(screen.getByRole("link", { name: "Applications" })).toHaveAttribute(
        "href",
        "http://dashboard.local.test:8080/en/my-submissions",
      )
      expect(screen.getByTestId("unread-badge")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument()
    })

    it("hides both cross-zone links in a profile-only deployment", () => {
      flagState.dashboard = false
      flagState.messages = false
      mockPathname = "/en/my-profile"
      render(<PageHeader publicName='Jane' onSignOut={() => {}} />)
      expect(dashboardCrossZoneLink()).toBeUndefined()
      expect(messagingCrossZoneLink()).toBeUndefined()
    })
  })
})
