import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import messageDetailStyles from "@/components/messages/message-detail.module.css"
import { SubmissionDetailToolbar } from "@/components/submissions/submission-detail-toolbar"
import detailStyles from "./submission-detail.module.css"

vi.mock("@ogcio/design-system-react", () => ({
  Icon: () => null,
  Link: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode
    href?: string
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const byNamespace: Record<string, Record<string, string>> = {
      "home.button": { back: "Back" },
      "submissions.detail": {
        toolbarAriaLabel: "Application actions",
      },
    }
    return byNamespace[namespace]?.[key] ?? key
  },
}))

describe("SubmissionDetailToolbar", () => {
  it("links Back to the applications list", () => {
    render(<SubmissionDetailToolbar backHref='/en/my-submissions' />)

    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/en/my-submissions",
    )
  })

  it("uses the shared message toolbar classes", () => {
    render(<SubmissionDetailToolbar backHref='/en/my-submissions' />)

    expect(screen.getByRole("navigation")).toHaveClass(
      messageDetailStyles.toolbar,
      detailStyles.detailToolbar,
    )
    expect(
      screen.getByRole("link", { name: "Back" }).querySelector("span"),
    ).toHaveClass(messageDetailStyles.toolbarLabel)
  })

  it("hides the full-bleed toolbar divider without its own inset", () => {
    const css = readFileSync(
      resolve(import.meta.dirname, "./submission-detail.module.css"),
      "utf8",
    )

    expect(css).toMatch(/\.detailToolbar::after\s*\{[^}]*display:\s*none/)
    expect(css).not.toMatch(/\.detailRoot\s*\{[^}]*margin-top/)
    expect(css).not.toMatch(/\.detailToolbar\s*\{[^}]*padding/)
  })
})
