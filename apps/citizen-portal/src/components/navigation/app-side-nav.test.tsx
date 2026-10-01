import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const flags = vi.hoisted(() => ({
  lea: true,
  showLinks: true as boolean | undefined,
}))
const nav = vi.hoisted(() => ({
  path: "/en/messages",
  items: [
    { id: "dashboard", label: "Dashboard", href: "/dashboard" },
    { id: "messages", label: "Messages", href: "/messages" },
  ] as { id: string; label: string; href: string }[],
}))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@citizen-portal/shared", () => ({
  useEnv: () => ({
    hosts: {
      messages: "http://messaging.local.test:8080",
      profile: "http://profile.local.test:8080",
      dashboard: "http://dashboard.local.test:8080",
    },
  }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/use-show-application-links", () => ({
  useApplicationLinksState: () => flags.showLinks,
}))

vi.mock("@/lib/feature-config", () => ({
  isLeaEnabled: () => flags.lea,
}))

vi.mock("@/components/messages/inbox-unread-badge", () => ({
  InboxUnreadBadge: () => <span data-testid='unread-badge' />,
  UnreadBadgeView: ({ count }: { count: number }) => (
    <span data-testid='placeholder-badge'>{count}</span>
  ),
}))

const unread = vi.hoisted(() => ({ count: 4, isLoading: false }))
vi.mock("@/components/messages/use-inbox-unread-count", () => ({
  useInboxUnreadCount: () => unread,
}))

vi.mock("./use-app-nav-items", () => ({
  activeAppNavId: (pathname: string) =>
    pathname.includes("/discovery") ? "lifeEvents" : "messages",
  useAppNavItems: () => nav.items,
}))

vi.mock("@ogcio/design-system-react", () => ({
  Paragraph: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  SideNav: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SideNavItem: ({
    label,
    href,
    actions,
    children,
  }: {
    label: string
    href: string
    actions?: ReactNode
    children?: ReactNode
  }) =>
    children ? (
      <>
        {children}
        {actions}
      </>
    ) : (
      <a href={href}>
        {label}
        {actions}
      </a>
    ),
}))

import { clearNavSnapshot, readNavSnapshot } from "@/util/nav-snapshot"
import { AppSideNav } from "./app-side-nav"

describe("AppSideNav", () => {
  beforeEach(() => {
    flags.lea = true
    flags.showLinks = true
    nav.path = "/en/messages"
    nav.items = [
      { id: "dashboard", label: "Dashboard", href: "/dashboard" },
      { id: "messages", label: "Messages", href: "/messages" },
    ]
  })

  it("lists destinations and the unread badge when LEA is on", () => {
    flags.lea = true
    flags.showLinks = true
    render(<AppSideNav />)
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    )
    expect(screen.getByRole("link", { name: /Messages/ })).toBeInTheDocument()
    expect(screen.getByTestId("unread-badge")).toBeInTheDocument()
  })

  it("renders nothing when LEA is off", () => {
    flags.lea = false
    const { container } = render(<AppSideNav />)
    expect(container).toBeEmptyDOMElement()
  })

  it("keeps the unread badge mounted and uses a path for the current host", () => {
    nav.path = "/en/discovery"
    nav.items = [
      {
        id: "lifeEvents",
        label: "Life events",
        href: "http://dashboard.local.test:8080/en/discovery",
      },
      {
        id: "messages",
        label: "Messages",
        href: "http://messaging.local.test:8080/en/messages",
      },
    ]
    const { rerender } = render(<AppSideNav />)
    const badge = screen.getByTestId("unread-badge")
    expect(screen.getByRole("link", { name: "Life events" })).toHaveAttribute(
      "href",
      "/en/discovery",
    )
    expect(screen.getByRole("link", { name: "Life events" }).querySelector("p")).toBeTruthy()
    expect(screen.getByRole("link", { name: /Messages/ })).toHaveAttribute(
      "href",
      "http://messaging.local.test:8080/en/messages",
    )

    nav.path = "/en/discovery/child-starting-school/apply-for-a-school-place"
    rerender(<AppSideNav />)
    expect(screen.getByTestId("unread-badge")).toBe(badge)
  })

  it("hands the count to the next host and draws it while sign-in loads", () => {
    clearNavSnapshot()
    const { unmount } = render(<AppSideNav />)
    expect(readNavSnapshot()).toBe(4)
    unmount()

    flags.showLinks = false
    render(<AppSideNav placeholder />)
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument()
    expect(screen.getByTestId("placeholder-badge")).toHaveTextContent("4")
  })

  it("draws no placeholder menu without a snapshot", () => {
    clearNavSnapshot()
    const { container } = render(<AppSideNav placeholder />)
    expect(container).toBeEmptyDOMElement()
  })

  it("keeps the menu and the snapshot while its auth check is pending", () => {
    clearNavSnapshot()
    render(<AppSideNav />).unmount()
    flags.showLinks = undefined
    render(<AppSideNav />)
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument()
    expect(readNavSnapshot()).toBe(4)
  })
})
