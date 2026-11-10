import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@ogcio/design-system-react", () => ({
  Footer: ({ utilitySlot }: { utilitySlot: React.ReactNode }) => (
    <footer>{utilitySlot}</footer>
  ),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { year?: number }) =>
    key === "text.trademark"
      ? `© ${values?.year ?? ""} Government of Ireland`
      : key,
}))

vi.mock("@/env/env.client", () => ({
  env: { NEXT_PUBLIC_PROFILE_URL: "https://profile.example" },
}))

import { ApplicationFooter } from "./application-footer"
import {
  FullWidthContainer,
  MainContainer,
  TwoColumnLayout,
} from "./containers"

describe("profile-admin layout", () => {
  it("renders each layout wrapper", () => {
    const { container } = render(
      <>
        <MainContainer>main</MainContainer>
        <TwoColumnLayout>columns</TwoColumnLayout>
        <FullWidthContainer>wide</FullWidthContainer>
      </>,
    )

    expect(screen.getByRole("main")).toHaveTextContent("main")
    expect(container.querySelector("article")).toHaveTextContent("columns")
    expect(screen.getByText("wide")).toBeInTheDocument()
  })

  it("renders localized policy links", () => {
    render(<ApplicationFooter />)

    expect(screen.getByRole("link", { name: "link.privacy" })).toHaveAttribute(
      "href",
      "https://profile.example/en/privacy-policy",
    )
    expect(screen.getAllByRole("link")).toHaveLength(5)
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Government of Ireland`),
    ).toBeInTheDocument()
  })
})
