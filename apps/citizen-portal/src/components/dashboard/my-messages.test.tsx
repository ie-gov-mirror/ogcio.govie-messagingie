import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let authState: {
  user: { sub: string } | null
  loading: boolean
} = { user: { sub: "user-1" }, loading: false }

let fetchState: {
  data: unknown
  error: unknown
  isLoading: boolean
} = { data: [], error: null, isLoading: false }

// Capture every (zone,path) the component passes to useCrossZoneLink
// so we can assert deep-links bake the cross-zone host in correctly.
const crossZoneCalls: Array<[string, string]> = []

vi.mock("@citizen-portal/shared", () => ({
  useCrossZoneLink: () => (zone: string, p: string) => {
    crossZoneCalls.push([zone, p])
    return `http://messaging.local.test:8080${p}`
  },
}))

vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => authState,
  useGatewayFetch: () => fetchState,
  MESSAGING_PUBLIC_SERVANT_ROLE_NAME: "Messaging Public Servant",
  PROFILE_PUBLIC_SERVANT_ROLE_NAME: "Profile Public Servant",
  DASHBOARD_PUBLIC_SERVANT_ROLE_NAME: "Dashboard Public Servant",
}))

vi.mock("@ogcio/sag-client", () => ({
  SagFetchError: class extends Error {
    constructor(public status: number) {
      super(`SagFetchError(${status})`)
    }
  },
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    (namespace: string) => (key: string, params?: Record<string, unknown>) => {
      const T: Record<string, string> = {
        "dashboard.messages.title": "Recent messages",
        "dashboard.messages.empty": "You have no messages",
        "dashboard.messages.link": "View all messages",
      }
      if (namespace === "dashboard.messages" && key === "error") {
        return `Server error: ${params?.message}`
      }
      return T[`${namespace}.${key}`] ?? `${namespace}.${key}`
    },
}))

// DS surfaces a pile of layout primitives; passthrough stubs keep the
// test focused on the cross-zone deep links + loading/empty branches.
vi.mock("@ogcio/design-system-react", () => ({
  FormField: ({ error }: { error?: { text: string } }) =>
    error ? <div data-testid='form-field-error'>{error.text}</div> : null,
  Heading: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/layout/containers", () => ({
  FullWidthContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock("@/components/list-card/list-card", () => ({
  ListCard: ({
    preview,
    onClick,
  }: {
    preview: React.ReactNode
    onClick?: () => void
  }) => (
    <button type='button' onClick={onClick}>
      {preview}
    </button>
  ),
}))

vi.mock("@/components/messages/sender-name", () => ({
  SenderName: () => <span>Sender</span>,
}))

import { MyMessages } from "@/components/dashboard/my-messages"

/**
 * `MyMessages` is the dashboard's preview-of-recent-messages card and
 * the canonical example of why the consolidation kept `useCrossZoneLink`
 * even after collapsing the three apps into one bundle: deep-link
 * targets (`/messages?id=…`) need to land on the messaging hostname
 * so nginx canonicalises the rest of the user's session there.
 */
describe("MyMessages", () => {
  beforeEach(() => {
    crossZoneCalls.length = 0
    authState = { user: { sub: "user-1" }, loading: false }
    fetchState = { data: [], error: null, isLoading: false }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("renders the loading spinner while auth is loading", () => {
    authState = { user: null, loading: true }
    render(<MyMessages />)
    expect(screen.getByLabelText("dashboard.messages.view")).toBeInTheDocument()
  })

  it("renders the loading spinner while the messages fetch is in flight", () => {
    fetchState = { data: undefined, error: null, isLoading: true }
    render(<MyMessages />)
    expect(screen.getByLabelText("dashboard.messages.view")).toBeInTheDocument()
  })

  it("renders the empty-state copy when there are no recent messages", () => {
    render(<MyMessages />)
    expect(screen.getByText("You have no messages")).toBeInTheDocument()
  })

  it("navigates to each message on the messaging hostname when selected", () => {
    fetchState = {
      data: [
        {
          id: "msg-1",
          subject: "Annual statement",
          createdAt: "2025-01-15T10:30:00Z",
        },
        {
          id: "msg-2",
          subject: "Payment confirmation",
          createdAt: "2025-02-01T09:00:00Z",
        },
      ],
      error: null,
      isLoading: false,
    }

    render(<MyMessages />)

    screen.getByRole("button", { name: "Annual statement" }).click()
    expect(crossZoneCalls).toContainEqual(["messages", "/en/messages?id=msg-1"])

    screen.getByRole("button", { name: "Payment confirmation" }).click()
    expect(crossZoneCalls).toContainEqual(["messages", "/en/messages?id=msg-2"])

    // The "View all" CTA must also cross-zone to the messaging host.
    expect(
      screen.getByRole("link", { name: "View all messages" }),
    ).toHaveAttribute("href", "http://messaging.local.test:8080/en/messages")

    // Every cross-zone call targets the messages zone — never profile
    // or dashboard. A regression here would break URL-content parity
    // (e.g. /my-profile?id=msg-1 has no meaning).
    expect(crossZoneCalls.every(([zone]) => zone === "messages")).toBe(true)
  })

  it("swallows transient 401s as a loading state (auth retry in flight)", async () => {
    const { SagFetchError } = await import("@ogcio/sag-client")
    fetchState = {
      data: undefined,
      error: new (
        SagFetchError as unknown as new (
          status: number,
        ) => Error & {
          status: number
        }
      )(401),
      isLoading: false,
    }
    render(<MyMessages />)
    // Critical: a transient 401 must NOT surface the "Server error"
    // banner — the cross-zone navigation pattern flickers a 401 between
    // SAG refreshes and the dashboard would scream-bleed errors
    // every time the user lands here.
    expect(screen.queryByTestId("form-field-error")).not.toBeInTheDocument()
    expect(screen.getByLabelText("dashboard.messages.view")).toBeInTheDocument()
  })

  it("renders the server-error message for non-401 failures", () => {
    fetchState = {
      data: undefined,
      error: new Error("kaboom"),
      isLoading: false,
    }
    render(<MyMessages />)
    expect(screen.getByTestId("form-field-error")).toBeInTheDocument()
    expect(screen.getByText(/kaboom/)).toBeInTheDocument()
  })
})
