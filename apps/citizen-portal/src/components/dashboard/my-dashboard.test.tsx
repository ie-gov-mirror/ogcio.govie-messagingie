import { render, screen } from "@testing-library/react"
import { Fragment } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Topology flag drives whether the recent-messages widget is part of the
// dashboard landing (AB#39580): a deployment without MessagingIE must not
// render a messages preview that 404s / implies messaging is present.
const flagState = vi.hoisted(() => ({ messages: true, lea: false }))
vi.mock("@/lib/feature-config", () => ({
  isZoneEnabled: (zone: "messages" | "profile" | "dashboard") =>
    zone === "messages" ? flagState.messages : true,
  isLeaEnabled: () => flagState.lea,
}))

vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({ user: { sub: "user-1" }, loading: false }),
}))

// Stubbed to a sentinel; `<PublicName>`'s own suite covers its states.
vi.mock("@/components/public-name", () => ({
  PublicName: () => <span data-testid='public-name'>Jane</span>,
}))

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const t = (key: string) => `${namespace}.${key}`
    // Mirror next-intl's `t.rich` by invoking the tag handlers.
    t.rich = (
      key: string,
      values: Record<string, (chunks?: React.ReactNode) => React.ReactNode>,
    ) => (
      <>
        {`${namespace}.${key}`}
        {Object.entries(values).map(([tag, render]) => (
          <Fragment key={tag}>{render()}</Fragment>
        ))}
      </>
    )
    return t
  },
}))

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}))

// Static asset import — vite can't resolve a real PNG under vitest.
vi.mock("@/public/govie.png", () => ({ default: "govie.png" }))

vi.mock("@/components/layout/containers", () => ({
  TwoColumnLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock("@/components/navigation/bold-link", () => ({
  BoldLink: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

vi.mock("@ogcio/design-system-react", () => ({
  Heading: ({
    as: Tag = "h2",
    className,
    children,
  }: {
    as?: "h1" | "h2" | "h3"
    className?: string
    children: React.ReactNode
  }) => <Tag className={className}>{children}</Tag>,
  Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Sentinels, plus this keeps the root `@ogcio/sag-client` barrel out of the
// module graph: it re-exports extension-less paths that Node ESM rejects.
vi.mock("@/components/dashboard/my-messages", () => ({
  MyMessages: () => <div data-testid='my-messages' />,
}))

vi.mock("@/components/dashboard/my-applications", () => ({
  MyApplications: () => <div data-testid='my-applications' />,
}))

import { MyDashboard } from "@/components/dashboard/my-dashboard"
import pageTitleStyles from "@/components/page-title.module.css"

describe("MyDashboard", () => {
  beforeEach(() => {
    flagState.messages = true
    flagState.lea = false
  })

  it("renders the recent-messages widget when messaging is enabled", () => {
    render(<MyDashboard />)
    expect(screen.getByTestId("my-messages")).toBeInTheDocument()
  })

  it("omits the recent-messages widget when messaging is disabled", () => {
    flagState.messages = false
    render(<MyDashboard />)
    expect(screen.queryByTestId("my-messages")).not.toBeInTheDocument()
    // The rest of the landing (welcome heading + help card) still renders.
    expect(screen.getByText("dashboard.welcome")).toBeInTheDocument()
    expect(screen.getByText("dashboard.help.title")).toBeInTheDocument()
  })

  it.each([false, true])(
    "renders the welcome name through PublicName (lea: %s)",
    (lea) => {
      // The heading must defer to the shared component, not read a name
      // field itself. Both layouts have their own heading, so pin both.
      flagState.lea = lea
      render(<MyDashboard />)
      expect(screen.getByTestId("public-name")).toBeInTheDocument()
      expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
        pageTitleStyles.pageTitle,
      )
    },
  )
})
