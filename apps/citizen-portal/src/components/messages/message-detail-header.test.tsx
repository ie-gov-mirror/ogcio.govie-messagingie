import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MessageDetailHeader } from "@/components/messages/message-detail-header"
import pageTitleStyles from "@/components/page-title.module.css"

const ORG_FIXTURES: Record<
  string,
  {
    id: string
    translations: {
      en: { name: string; shortName: string }
      ga: { name: string; shortName: string }
    }
  }
> = {
  "org-edu": {
    id: "org-edu",
    translations: {
      en: { name: "Department of Education", shortName: "DoE" },
      ga: { name: "An Roinn Oideachais", shortName: "ARO" },
    },
  },
}

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayFetch: (path: string | null) => {
    if (!path) {
      return {
        data: undefined,
        error: null,
        isLoading: false,
        refresh: vi.fn(),
      }
    }
    const orgMatch = path.match(/^\/profile\/api\/v1\/organisations\/(.+)$/)
    const data = orgMatch ? ORG_FIXTURES[orgMatch[1]] : undefined
    return { data, error: null, isLoading: false, refresh: vi.fn() }
  },
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace: string) => (key: string) => {
    const byNamespace: Record<string, Record<string, string>> = {
      "home.detail": {
        from: "From:",
        date: "Date:",
        noSubject: "(no subject)",
      },
      "home.table": {
        unknownSender: "Unknown sender",
      },
    }
    return byNamespace[namespace]?.[key] ?? key
  },
}))

describe("MessageDetailHeader", () => {
  it("renders subject, resolved sender, and formatted date", () => {
    render(
      <MessageDetailHeader
        subject='Payslip for Mark Murphy'
        organisationId='org-edu'
        createdAt='2026-04-17T10:00:00Z'
      />,
    )

    expect(
      screen.getByRole("heading", { name: "Payslip for Mark Murphy" }),
    ).toHaveClass(pageTitleStyles.pageTitle)
    expect(screen.getByText("From:")).toBeInTheDocument()
    expect(screen.getByText("Department of Education")).toBeInTheDocument()
    expect(screen.getByText("Date:")).toBeInTheDocument()
    expect(screen.getByText("17 April 2026")).toBeInTheDocument()
    expect(screen.getByRole("time")).toHaveAttribute(
      "dateTime",
      "2026-04-17T10:00:00Z",
    )
  })

  it("shows the no-subject fallback when subject is empty", () => {
    render(
      <MessageDetailHeader
        subject=''
        organisationId='org-edu'
        createdAt='2026-04-17T10:00:00Z'
      />,
    )

    expect(
      screen.getByRole("heading", { name: "(no subject)" }),
    ).toBeInTheDocument()
  })
})
