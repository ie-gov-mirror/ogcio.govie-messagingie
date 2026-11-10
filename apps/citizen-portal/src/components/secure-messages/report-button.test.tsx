import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@ogcio/design-system-react", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
}))
vi.mock("@/components/css-spinner", () => ({
  CssSpinner: () => <span aria-label='loading' />,
}))
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({ user: { email: "citizen+test@example.ie" } }),
}))
vi.mock("@/env/env.client", () => ({
  env: {
    NEXT_PUBLIC_ERROR_FORM_ID: "report-problem",
    NEXT_PUBLIC_FORMS_SERVICE_URL: "https://forms.example.ie/base/",
  },
}))

import { fakeAnalytics } from "../../../test/utils/analytics"
import { ReportButton } from "./report-button"

let href = ""

describe("ReportButton", () => {
  beforeEach(() => {
    href = ""
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        get href() {
          return href
        },
        set href(value: string) {
          href = value
        },
      },
    })
  })

  it("disables itself and redirects to the report form with the user email", () => {
    render(<ReportButton />)

    const button = screen.getByRole("button", { name: "report" })
    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(screen.getByLabelText("loading")).toBeInTheDocument()
    expect(href).toBe(
      "https://forms.example.ie/base/report-problem?userEmail=citizen%2Btest%40example.ie",
    )
  })

  it("tracks the report, without the citizen's email in the event", () => {
    const analytics = fakeAnalytics()
    analytics.render(<ReportButton />)

    fireEvent.click(screen.getByRole("button", { name: "report" }))

    expect(analytics.event.mock.calls).toEqual([
      [
        {
          event: {
            name: "account-linking-report",
            category: "Account Linking",
            action: "Problem Reported",
          },
        },
      ],
    ])
  })
})
