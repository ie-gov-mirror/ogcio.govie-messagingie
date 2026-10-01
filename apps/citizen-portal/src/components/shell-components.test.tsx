import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearNavSnapshot, readNavName } from "@/util/nav-snapshot"
import { OnboardingShell } from "./onboarding-shell"
import { PublicShell } from "./public-shell"
import { ShellLoadingChrome } from "./shell-loading-chrome"

let pathname = "/en/messages"
let locale = "en"

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams("source=test"),
}))

vi.mock("next-intl", () => ({
  useLocale: () => locale,
  useTranslations: (namespace: string) => (key: string) =>
    namespace === "navigation.title" ? `title:${key}` : `nav:${key}`,
}))

vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({
    user: { name: "Jane" },
    signOut: vi.fn(),
  }),
}))

vi.mock("@citizen-portal/shared", () => ({
  CitizenSagProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid='sag-provider'>{children}</div>
  ),
}))

vi.mock("@ogcio/design-system-react", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    Container: Pass,
    HeaderLogo: Pass,
    HeaderNext: Pass,
    HeaderSecondaryMenu: Pass,
    HeaderTitle: Pass,
    HeaderMenuItemLink: ({
      href,
      children,
    }: {
      href: string
      children: ReactNode
    }) => <a href={href}>{children}</a>,
    HeaderMenuItemSlot: Pass,
  }
})

vi.mock("@ogcio/design-system-react/logos", () => ({
  LogoHarpWhite: () => <span />,
  LogoWhite: () => <span />,
}))

vi.mock("@/components/layout/application-footer", () => ({
  ApplicationFooter: ({
    showContactSupport,
    showWhatsNew,
  }: {
    showContactSupport?: boolean
    showWhatsNew?: boolean
  }) => (
    <footer
      data-contact={String(showContactSupport)}
      data-whats-new={String(showWhatsNew)}
    />
  ),
}))

vi.mock("@/components/layout/containers", () => ({
  MainContainer: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
  AppMainContent: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}))

vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div>Loading</div>,
}))

vi.mock("@/components/navigation/page-header", () => ({
  PageHeader: ({
    publicName,
    title,
    logoHref,
    languageHref,
  }: {
    publicName: ReactNode
    title: string
    logoHref: string
    languageHref: string
  }) => (
    <header
      data-logo-href={logoHref}
      data-language-href={languageHref}
      data-title={title}
    >
      {publicName}
    </header>
  ),
}))

vi.mock("@/hooks/use-active-locale", () => ({
  useActiveLocale: () => locale,
}))
vi.mock("@/lib/feature-config", () => ({ isLeaEnabled: () => true }))
vi.mock("@/lib/zone-config", () => ({
  ZONE_CONFIG: {
    messages: { rootPath: "/messages", sagAppName: "messaging" },
    profile: { rootPath: "/my-profile", sagAppName: "profile" },
    dashboard: { rootPath: "/my-dashboard", sagAppName: "dashboard" },
  },
}))
vi.mock("@/util/get-zone-from-path", () => ({
  getZoneFromPath: () => "messages",
}))
vi.mock("@/util/locale-switch-href", () => ({
  buildLocaleSwitchHref: (
    path: string,
    current: string,
    opposite: string,
  ) => path.replace(`/${current}/`, `/${opposite}/`),
}))

describe("shell components", () => {
  beforeEach(() => {
    clearNavSnapshot()
  })

  it("renders authenticated loading chrome", () => {
    pathname = "/en/my-submissions"
    locale = "en"
    render(<ShellLoadingChrome zone='dashboard' />)

    expect(screen.getByRole("link", { name: "title:submissions" })).toHaveAttribute(
      "href",
      "/en/my-submissions",
    )
    expect(screen.getByText("Loading")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "nav:logout" })).toBeNull()
  })

  it("shows the stored name and logout while auth is still loading", () => {
    document.cookie = "citizen_portal_nav_name=Andrew%20Parker"
    render(<ShellLoadingChrome zone='dashboard' />)

    expect(screen.getByText(/Andrew Parker/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "nav:logout" }))
    expect(readNavName()).toBeNull()
  })

  it("renders public content with public-only footer options", () => {
    pathname = "/en/messages"
    locale = "en"
    render(<PublicShell>Public content</PublicShell>)

    expect(screen.getByRole("main")).toHaveTextContent("Public content")
    expect(screen.getByRole("contentinfo")).toHaveAttribute(
      "data-whats-new",
      "false",
    )
  })

  it("keeps onboarding inside its no-locale flow", () => {
    locale = "en"
    render(<OnboardingShell>Onboarding content</OnboardingShell>)

    const header = screen.getByRole("banner")
    expect(header).toHaveTextContent("Jane")
    expect(header).toHaveAttribute("data-logo-href", "/onboarding")
    expect(header).toHaveAttribute(
      "data-language-href",
      "/onboarding?lng=ga&source=test",
    )
    expect(screen.getByText("Onboarding content")).toBeInTheDocument()
  })
})
