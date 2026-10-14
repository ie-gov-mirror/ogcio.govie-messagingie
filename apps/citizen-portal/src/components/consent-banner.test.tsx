import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ConsentBanner } from "./consent-banner"

let isOptedOut = false

vi.mock("@ogcio/consent/react", () => ({
  FORCE_CONSENT_PARAM: "force-consent",
  useConsent: () => ({ isOptedOut }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/messages",
}))

vi.mock("next-intl", () => ({
  useTranslations: () => ({
    rich: (_key: string, values: { link: (chunks: ReactNode) => ReactNode }) =>
      values.link("Review consent"),
  }),
}))

vi.mock("@ogcio/design-system-react", () => ({
  Alert: ({ title }: { title: ReactNode }) => <div>{title}</div>,
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

describe("ConsentBanner", () => {
  beforeEach(() => {
    isOptedOut = false
  })

  it("only offers the forced consent flow to opted-out users", async () => {
    const { rerender } = render(<ConsentBanner />)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()

    isOptedOut = true
    rerender(<ConsentBanner />)

    expect(
      await screen.findByRole("link", { name: "Review consent" }),
    ).toHaveAttribute(
      "href",
      "http://localhost:3000/en/messages?force-consent=1",
    )
  })
})
