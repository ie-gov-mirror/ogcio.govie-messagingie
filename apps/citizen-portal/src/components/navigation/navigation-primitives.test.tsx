import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { BoldLink } from "./bold-link"
import { UserMenuDrawer } from "./user-menu-drawer"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@ogcio/design-system-react", () => ({
  Heading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  Icon: () => null,
  ListItem: ({ href, label }: { href: string; label: string }) => (
    <a href={href}>{label}</a>
  ),
}))

describe("navigation primitives", () => {
  it("renders BoldLink as a bold link", () => {
    render(<BoldLink href='/target'>Target</BoldLink>)

    expect(screen.getByRole("link", { name: "Target" })).toHaveAttribute(
      "href",
      "/target",
    )
    expect(screen.getByText("Target")).toHaveClass("gi-font-bold")
  })

  it("renders the user menu contract and signs out", () => {
    const onSignOut = vi.fn()
    const { rerender } = render(
      <UserMenuDrawer
        name='Jane'
        profileHref='/profile'
        onSignOut={onSignOut}
        languageHref='/ga'
        languageLabel='Gaeilge'
      >
        <li>Navigation</li>
      </UserMenuDrawer>,
    )

    expect(screen.getByRole("heading", { name: "Jane" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "viewMyProfile" })).toHaveAttribute(
      "href",
      "/profile",
    )
    expect(screen.getByRole("link", { name: "Gaeilge" })).toHaveAttribute(
      "href",
      "/ga",
    )
    fireEvent.click(screen.getByRole("button", { name: "logout" }))
    expect(onSignOut).toHaveBeenCalledOnce()

    rerender(
      <UserMenuDrawer
        name='Jane'
        profileHref='/profile'
        onSignOut={onSignOut}
        languageHref='/ga'
        languageLabel='Gaeilge'
        showProfileLink={false}
      />,
    )
    expect(
      screen.queryByRole("link", { name: "viewMyProfile" }),
    ).not.toBeInTheDocument()
  })
})
