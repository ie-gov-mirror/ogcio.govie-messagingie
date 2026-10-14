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
  Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/components/css-spinner", () => ({
  CssSpinner: () => <span aria-label='loading' />,
}))
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key
    t.rich = (key: string) => key
    return t
  },
}))
vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({ user: undefined }),
}))
vi.mock("@/env/env.client", () => ({
  env: {
    NEXT_PUBLIC_ERROR_FORM_ID: "report-problem",
    NEXT_PUBLIC_FORMS_SERVICE_URL: "https://forms.example.ie/",
  },
}))

import { ServiceError } from "./service-error"

let href = ""

describe("ServiceError", () => {
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

  it("shows the server error and reports anonymously when no email exists", () => {
    render(<ServiceError />)

    expect(screen.getByText("error.server")).toBeInTheDocument()
    const button = screen.getByRole("button", { name: "report" })
    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(screen.getByLabelText("loading")).toBeInTheDocument()
    expect(href).toBe("https://forms.example.ie/report-problem?userEmail=")
  })
})
