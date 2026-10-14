import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AuthenticatedLayout from "./layout"
import MessagesPage from "./messages/page"
import MyDashboardPage from "./my-dashboard/page"
import MyProfilePage from "./my-profile/page"
import MySubmissionsPage from "./my-submissions/page"
import SecureMessagesPage from "./secure-messages/page"
import WhatsNewPage from "./whats-new/page"

const { flags, locationReplace, setRequestLocale } = vi.hoisted(() => ({
  flags: { dashboard: true, lea: true },
  locationReplace: vi.fn(),
  setRequestLocale: vi.fn(),
}))

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  use: () => ({ locale: "en" }),
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
}))

vi.mock("next-intl/server", () => ({
  setRequestLocale,
}))

vi.mock("@/lib/feature-config", () => ({
  getEnabledLandingZone: () => "messages",
  isLeaEnabled: () => flags.lea,
  isZoneEnabled: () => flags.dashboard,
}))

vi.mock("@/lib/zone-config", () => ({
  ZONE_CONFIG: { messages: { rootPath: "/messages" } },
}))

vi.mock("@/components/client-shell", () => ({
  ClientShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='client-shell'>{children}</div>
  ),
}))

vi.mock("@/components/messages/messages-page-content", () => ({
  MessagesPageContent: ({ locale }: { locale: string }) => (
    <div>Messages {locale}</div>
  ),
}))

vi.mock("@/components/dashboard/my-dashboard", () => ({
  MyDashboard: () => <div>Dashboard</div>,
}))

vi.mock("@/components/profile/my-profile", () => ({
  MyProfile: () => <div>Profile</div>,
}))

vi.mock("@/components/submissions/submissions", () => ({
  SubmissionsPage: () => <div>Submissions</div>,
}))

vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div>Loading</div>,
}))

vi.mock("@/components/messages/messages-loading", () => ({
  MessagesLoading: () => <div>Loading messages</div>,
}))

vi.mock("@/components/secure-messages/secure-message-page-client", () => ({
  SecureMessagePageClient: () => <div>Secure messages</div>,
}))

vi.mock("@/components/whats-new/whats-new", () => ({
  WhatsNew: () => <div>What's new</div>,
}))

describe("authenticated app routes", () => {
  beforeEach(() => {
    flags.dashboard = true
    flags.lea = true
    locationReplace.mockReset()
    setRequestLocale.mockClear()
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { replace: locationReplace },
    })
  })

  it("wraps authenticated content in the client shell", () => {
    render(
      <AuthenticatedLayout>
        <p>Private content</p>
      </AuthenticatedLayout>,
    )

    expect(screen.getByTestId("client-shell")).toHaveTextContent(
      "Private content",
    )
  })

  it("passes the route locale to the messages view", () => {
    render(<MessagesPage params={Promise.resolve({ locale: "en" })} />)

    expect(screen.getByText("Messages en")).toBeInTheDocument()
  })

  it("renders the dashboard view when its zone is enabled", () => {
    render(<MyDashboardPage />)

    expect(screen.getByText("Dashboard")).toBeInTheDocument()
  })

  it("redirects away from the dashboard when its zone is disabled", () => {
    flags.dashboard = false

    render(<MyDashboardPage />)

    expect(screen.getByText("Loading")).toBeInTheDocument()
    expect(locationReplace).toHaveBeenCalledWith("/en/messages")
  })

  it("renders the profile view", () => {
    render(<MyProfilePage />)

    expect(screen.getByText("Profile")).toBeInTheDocument()
  })

  it("renders submissions when dashboard and LEA are enabled", () => {
    render(<MySubmissionsPage />)

    expect(screen.getByText("Submissions")).toBeInTheDocument()
  })

  it("redirects away from submissions when LEA is disabled", () => {
    flags.lea = false

    render(<MySubmissionsPage />)

    expect(screen.getByText("Loading")).toBeInTheDocument()
    expect(locationReplace).toHaveBeenCalledWith("/en/messages")
  })

  it("renders secure messages and sets the request locale", () => {
    render(<SecureMessagesPage params={Promise.resolve({ locale: "en" })} />)

    expect(setRequestLocale).toHaveBeenCalledWith("en")
    expect(screen.getByText("Secure messages")).toBeInTheDocument()
  })

  it("renders the what's-new view and sets the request locale", () => {
    render(<WhatsNewPage params={Promise.resolve({ locale: "en" })} />)

    expect(setRequestLocale).toHaveBeenCalledWith("en")
    expect(screen.getByText("What's new")).toBeInTheDocument()
  })
})
