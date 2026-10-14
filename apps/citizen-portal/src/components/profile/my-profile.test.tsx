import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  exportEnabled: false,
  gateway: {
    data: undefined as
      | {
          id: string
          primaryUserId: string
          publicName: string
          email?: string
          details?: { firstName?: string; lastName?: string; ppsn?: string }
        }
      | undefined,
    error: null as Error | null,
    isLoading: false,
    isValidating: false,
    refresh: vi.fn(),
  },
}))

vi.mock("@citizen-portal/shared", () => ({
  useEnv: () => ({ hosts: { messages: "https://messages.example" } }),
}))
vi.mock("@ogcio/sag-client", () => ({
  SagFetchError: class extends Error {
    constructor(public status: number) {
      super("gateway error")
    }
  },
}))
vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({ user: { sub: "user-1" }, loading: false }),
  useGatewayFetch: () => state.gateway,
}))
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))
vi.mock("@/hooks/use-idle-mount", () => ({ useIdleMount: () => true }))
vi.mock("@/components/feature-flags-provider", () => ({
  useFeatureFlags: () => ({ isUserExportEnabled: state.exportEnabled }),
}))
vi.mock("@/components/layout/containers", () => ({
  TwoColumnLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock("@/components/profile/public-name-form", () => ({
  PublicNameForm: ({ publicName }: { publicName: string }) => (
    <div>public name:{publicName}</div>
  ),
}))
vi.mock("@/components/consent/consent-section", () => ({
  ConsentSection: ({ messagingUrl }: { messagingUrl: string }) => (
    <div>consent:{messagingUrl}</div>
  ),
}))
vi.mock("@/components/lifecycle-tasks/lifecycle-tasks", () => ({
  LifecycleTasks: ({ profileId }: { profileId: string }) => (
    <div>lifecycle:{profileId}</div>
  ),
}))
vi.mock("@ogcio/design-system-react", async () => {
  const actual = await vi.importActual<
    typeof import("@ogcio/design-system-react")
  >("@ogcio/design-system-react")
  return {
    Heading: actual.Heading,
    Paragraph: ({ children }: { children: React.ReactNode }) => (
      <p>{children}</p>
    ),
    Stack: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    SummaryList: ({ children }: { children: React.ReactNode }) => (
      <dl>{children}</dl>
    ),
    SummaryListRow: ({
      children,
      label,
    }: {
      children: React.ReactNode
      label: string
    }) => (
      <div>
        <dt>{label}</dt>
        {children}
      </div>
    ),
    SummaryListValue: ({ children }: { children: React.ReactNode }) => (
      <dd>{children}</dd>
    ),
    SummaryListAction: ({
      children,
      onClick,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a onClick={onClick} {...props}>
        {children}
      </a>
    ),
  }
})

import pageTitleStyles from "@/components/page-title.module.css"
import { MyProfile } from "./my-profile"

describe("MyProfile", () => {
  beforeEach(() => {
    state.exportEnabled = false
    state.gateway.data = undefined
    state.gateway.error = null
    state.gateway.isLoading = false
    state.gateway.isValidating = false
  })

  it("shows an accessible loading state before profile data arrives", () => {
    state.gateway.isLoading = true
    render(<MyProfile />)
    expect(screen.getByLabelText("Loading profile")).toBeInTheDocument()
  })

  it("shows the generic server error when the profile fetch fails", () => {
    state.gateway.error = new Error("boom")
    render(<MyProfile />)
    expect(screen.getByText("errors.server")).toBeInTheDocument()
  })

  it("renders profile details and lets the user reveal and hide their PPSN", () => {
    state.gateway.data = {
      id: "profile-1",
      primaryUserId: "user-1",
      publicName: "Jane",
      email: "jane@example.com",
      details: { firstName: "Jane", lastName: "Doe", ppsn: "1234567A" },
    }
    render(<MyProfile />)
    expect(
      screen.getByRole("heading", { level: 1, name: "profile.title" }),
    ).toHaveClass(pageTitleStyles.pageTitle)
    for (const name of ["profile.name", "PPSN", "profile.contactDetails"]) {
      const heading = screen.getByRole("heading", { level: 2, name })
      expect(heading).toHaveClass("gi-text-lg", "xl:gi-text-xl")
      expect(heading.className).not.toContain("xl:gi-text-2xl")
    }
    expect(screen.getByText("public name:Jane")).toBeInTheDocument()
    expect(screen.getByText("jane@example.com")).toBeInTheDocument()
    expect(screen.queryByText("1234567A")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("profile.clickToReveal"))
    expect(screen.getByText("1234567A")).toBeInTheDocument()
    fireEvent.click(screen.getByText("profile.clickToHide"))
    expect(screen.queryByText("1234567A")).not.toBeInTheDocument()
  })

  it("mounts data export controls only when the feature is enabled", () => {
    state.exportEnabled = true
    state.gateway.data = {
      id: "profile-1",
      primaryUserId: "user-1",
      publicName: "Jane",
    }
    render(<MyProfile />)
    expect(screen.getByText("lifecycle:profile-1")).toBeInTheDocument()
  })
})
