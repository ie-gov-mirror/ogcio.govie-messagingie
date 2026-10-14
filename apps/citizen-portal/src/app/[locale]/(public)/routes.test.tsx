import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import AccessibilityStatement from "./accessibility-statement/page"
import ContactSupport from "./contact-support/page"
import CookiePolicy from "./cookie-policy/page"
import ListCardStatesDemoPage from "./demo/list-card-states/page"
import PublicLayout from "./layout"
import WrongAccountErrorPage from "./wrong-account-error/page"
import WrongLoginMethodErrorPage from "./wrong-login-method-error/page"

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key
    t.rich = (key: string) => key
    return t
  },
}))

vi.mock("@/components/public-shell", () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='public-shell'>{children}</div>
  ),
}))

vi.mock("@/components/list-card/list-card", () => ({
  ListCard: ({ title }: { title: string }) => <article>{title}</article>,
}))

vi.mock("./wrong-account-error/wrong-account-error-client", () => ({
  WrongAccountErrorClient: () => <div>Wrong account</div>,
}))

vi.mock("./wrong-login-method-error/wrong-login-method-error-client", () => ({
  WrongLoginMethodErrorClient: () => <div>Wrong login method</div>,
}))

describe("public app routes", () => {
  it("wraps public content in the public shell", () => {
    render(
      <PublicLayout>
        <p>Public content</p>
      </PublicLayout>,
    )

    expect(screen.getByTestId("public-shell")).toHaveTextContent(
      "Public content",
    )
  })

  it("renders the accessibility statement", () => {
    render(<AccessibilityStatement />)

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Statement of commitment",
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/S\.I\. 358\/2020/)).toBeInTheDocument()
  })

  it("renders contact support actions", () => {
    render(<ContactSupport />)

    expect(
      screen.getByRole("heading", { level: 1, name: "title.main" }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole("link")).toHaveLength(2)
  })

  it("renders the cookie policy", () => {
    render(<CookiePolicy />)

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Cookie Disclaimer and Policy",
      }),
    ).toBeInTheDocument()
    expect(screen.getByText("Last Updated: 05/03/2025")).toBeInTheDocument()
  })

  it("renders every list-card demo state", () => {
    render(<ListCardStatesDemoPage />)

    expect(screen.getByTestId("list-card-states-demo")).toBeInTheDocument()
    expect(screen.getAllByRole("article")).toHaveLength(6)
  })

  it("delegates both public error routes to their client views", () => {
    const { rerender } = render(<WrongAccountErrorPage />)
    expect(screen.getByText("Wrong account")).toBeInTheDocument()

    rerender(<WrongLoginMethodErrorPage />)
    expect(screen.getByText("Wrong login method")).toBeInTheDocument()
  })
})
