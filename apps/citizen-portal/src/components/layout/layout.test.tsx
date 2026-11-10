import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { ApplicationFooter } from "./application-footer"
import {
  AppMainContent,
  FullWidthContainer,
  MainContainer,
  TwoColumnLayout,
} from "./containers"

vi.mock("@citizen-portal/shared", () => ({
  useCrossZoneLink: () => (zone: string, path: string) =>
    `https://${zone}.example${path}`,
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { year?: number }) =>
    key === "text.trademark"
      ? `© ${values?.year ?? ""} Government of Ireland`
      : key,
}))

vi.mock("@ogcio/design-system-react", () => ({
  Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Footer: ({ utilitySlot }: { utilitySlot: ReactNode }) => (
    <footer>{utilitySlot}</footer>
  ),
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

describe("layout components", () => {
  it("renders every container without changing its content", () => {
    const { rerender } = render(<MainContainer>main</MainContainer>)
    const main = screen.getByRole("main")
    expect(main).toHaveTextContent("main")
    expect(main).toHaveClass("gi-py-4", "md:gi-py-6", "lg:gi-py-8")
    expect(main).not.toHaveStyle({ marginTop: "var(--gieds-space-10)" })

    rerender(<TwoColumnLayout>columns</TwoColumnLayout>)
    expect(screen.getByText("columns").closest("article")).toHaveClass(
      "two-columns",
    )

    rerender(<FullWidthContainer>full</FullWidthContainer>)
    expect(screen.getByText("full")).toHaveStyle({ width: "100%" })

    rerender(<AppMainContent>app</AppMainContent>)
    expect(screen.getByRole("main")).toHaveTextContent("app")
  })

  it("renders policy links and honours optional footer links", () => {
    const { rerender } = render(<ApplicationFooter />)

    expect(screen.getByRole("link", { name: "link.privacy" })).toHaveAttribute(
      "href",
      "https://profile.example/en/privacy-policy",
    )
    expect(
      screen.getByRole("link", { name: "link.whatsNew" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "link.contactSupport" }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Government of Ireland`),
    ).toBeInTheDocument()

    rerender(
      <ApplicationFooter showWhatsNew={false} showContactSupport={false} />,
    )
    expect(
      screen.queryByRole("link", { name: "link.whatsNew" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "link.contactSupport" }),
    ).not.toBeInTheDocument()
  })
})
