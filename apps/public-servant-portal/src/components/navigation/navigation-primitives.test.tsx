import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DrawerLink } from "./DrawerLink"
import { OrganizationSelector } from "./OrganizationSelector"
import UserMenuDrawer from "./UserMenuDrawer"

const { setOrganization, signOut, trackEvent, useOrganizationContext } =
  vi.hoisted(() => ({
    setOrganization: vi.fn(),
    signOut: vi.fn(),
    trackEvent: vi.fn(),
    useOrganizationContext: vi.fn(),
  }))

vi.mock("@/hooks/use-organization-context", () => ({
  useOrganizationContext: () => useOrganizationContext(),
}))
vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({ signOut }),
}))
vi.mock("@ogcio/nextjs-analytics", () => ({
  useAnalytics: () => ({ trackEvent }),
}))
vi.mock("@ogcio/design-system-react", () => ({
  FormField: ({
    children,
    label,
  }: {
    children: ReactNode
    label?: { text: string }
  }) => (
    <div>
      <span>{label?.text}</span>
      {children}
    </div>
  ),
  Heading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Link: ({
    children,
    asButton,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    asButton?: unknown
  }) => <a {...props}>{children}</a>,
  Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} />
  ),
  SelectItem: (props: React.OptionHTMLAttributes<HTMLOptionElement>) => (
    <option {...props} />
  ),
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

describe("navigation primitives", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useOrganizationContext.mockReturnValue({
      organizations: [],
      currentOrganization: undefined,
      setOrganization,
    })
  })

  it("renders drawer links with the requested emphasis", () => {
    render(
      <DrawerLink href='/profile' isBold>
        Profile
      </DrawerLink>,
    )
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    )
    expect(screen.getByText("Profile").style.fontWeight).toBe(
      "var(--gieds-font-weight-700)",
    )
  })

  it("renders organization options and reports changes", () => {
    const handleChange = vi.fn()
    const { rerender } = render(
      <OrganizationSelector
        actionTitle='Change'
        title='Department'
        organizations={[
          { id: "one", name: "One" },
          { id: "two", name: "Two" },
        ]}
        defaultOrganization='two'
        handleChange={handleChange}
      />,
    )
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "one" } })
    expect(handleChange).toHaveBeenCalledWith("one")

    rerender(
      <OrganizationSelector
        actionTitle='Change'
        organizations={[]}
        handleChange={handleChange}
      />,
    )
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("renders the user menu, changes organization, and signs out", () => {
    useOrganizationContext.mockReturnValue({
      organizations: [
        { id: "one", name: "One" },
        { id: "two", name: "Two" },
      ],
      currentOrganization: { id: "one", name: "One" },
      setOrganization,
    })
    render(
      <UserMenuDrawer
        name='Jane'
        selfHref='/profile'
        selfLabel='Profile'
        signoutLabel='Logout'
      >
        <span>Navigation</span>
      </UserMenuDrawer>,
    )
    expect(screen.getByRole("heading", { name: "Jane" })).toBeInTheDocument()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "two" } })
    expect(setOrganization).toHaveBeenCalledWith("two")

    fireEvent.click(screen.getByRole("link", { name: "Logout" }))
    expect(trackEvent).toHaveBeenCalledOnce()
    expect(signOut).toHaveBeenCalledOnce()
  })
})
