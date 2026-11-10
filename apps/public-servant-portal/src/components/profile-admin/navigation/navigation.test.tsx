import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { organizationContext, signOutMock } = vi.hoisted(() => ({
  organizationContext: {
    organizations: [
      { id: "org-1", name: "One" },
      { id: "org-2", name: "Two" },
    ],
    currentOrganization: { id: "org-1", name: "One" },
    setOrganization: vi.fn(),
  },
  signOutMock: vi.fn(),
}))

vi.mock("@/hooks/profile-admin/use-organization-context", () => ({
  useOrganizationContext: () => organizationContext,
}))

vi.mock("@/env/env.client", () => ({
  env: { NEXT_PUBLIC_MESSAGING_ADMIN_URL: "https://messaging.example" },
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/service-users",
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { organization?: string }) =>
    values?.organization ? `${key}:${values.organization}` : key,
}))

vi.mock("@ogcio/design-system-react/logos", () => ({
  LogoHarpWhite: () => <span>harp</span>,
  LogoWhite: () => <span>logo</span>,
}))

vi.mock("@ogcio/design-system-react", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props} />
  ),
  DrawerBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerWrapper: ({
    children,
    isOpen,
  }: {
    children: React.ReactNode
    isOpen: boolean
  }) => (isOpen ? <aside>{children}</aside> : null),
  FormField: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  HeaderLogo: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  HeaderMenuItemButton: ({
    showItemMode: _showItemMode,
    icon: _icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    showItemMode?: string
    icon?: string
  }) => <button type='button' {...props} />,
  HeaderMenuItemLink: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => <a href={href}>{children}</a>,
  HeaderNext: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
  HeaderPrimaryMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  HeaderSecondaryMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  HeaderTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Heading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Icon: () => <span data-testid='icon' />,
  Link: ({
    href,
    children,
    onClick,
  }: {
    href?: string
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
  Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} />
  ),
  SelectItem: (props: React.OptionHTMLAttributes<HTMLOptionElement>) => (
    <option {...props} />
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { BackButton, BackLink } from "./back-link"
import { DrawerLink } from "./drawer-link"
import { OrganizationSelector } from "./organization-selector"
import { PageHeader } from "./page-header"
import { UserMenuDrawer } from "./user-menu-drawer"

describe("profile-admin navigation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renders links and handles back button clicks", () => {
    const onClick = vi.fn()
    render(
      <>
        <BackLink href='/back'>Back</BackLink>
        <BackButton onClick={onClick}>Previous</BackButton>
        <DrawerLink href='/drawer' bold>
          Drawer
        </DrawerLink>
      </>,
    )

    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/back",
    )
    fireEvent.click(screen.getByText("Previous"))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByText("Drawer").style.fontWeight).toBe(
      "var(--gieds-font-weight-700)",
    )
  })

  it("renders no back control without children", () => {
    const { container } = render(
      <>
        <BackLink href='/back' />
        <BackButton onClick={vi.fn()} />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("selects an organization and handles empty options", () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <OrganizationSelector
        title='Organization'
        organizations={organizationContext.organizations}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "org-2" },
    })
    expect(onChange).toHaveBeenCalledWith("org-2")

    rerender(<OrganizationSelector organizations={[]} onChange={onChange} />)
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("renders the user menu and switches organization", () => {
    render(
      <UserMenuDrawer
        name='Alice'
        profileHref='/en/my-profile'
        onSignOut={signOutMock}
      >
        child
      </UserMenuDrawer>,
    )
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "org-2" },
    })
    fireEvent.click(screen.getByRole("button", { name: "logout" }))

    expect(organizationContext.setOrganization).toHaveBeenCalledWith("org-2")
    expect(signOutMock).toHaveBeenCalledOnce()
    expect(screen.getByRole("link", { name: "viewMyProfile" })).toHaveAttribute(
      "href",
      "/en/my-profile",
    )
  })

  it("opens the page header drawer with localized navigation", () => {
    render(<PageHeader publicName='Alice' onSignOut={signOutMock} />)
    expect(screen.getByText("titleWithOrg:One")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "language.irish" }),
    ).toHaveAttribute("href", "/ga/service-users")

    fireEvent.click(screen.getByRole("button", { name: "menu" }))
    expect(
      screen.getByRole("link", { name: "drawer.messaging" }),
    ).toHaveAttribute("href", "https://messaging.example/en")
    expect(screen.getByText("Alice")).toBeInTheDocument()
  })
})
