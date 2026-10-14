import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type FetchState = {
  data?: unknown
  error?: unknown
  isLoading: boolean
}

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams("id=message-id"),
  fetchStates: [] as FetchState[],
  fetchCalls: [] as unknown[][],
  fetchIndex: 0,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/secure-messages",
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}))
vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({ user: { sub: "current-user-id" } }),
  useGatewayFetch: (...args: unknown[]) => {
    mocks.fetchCalls.push(args)
    return (
      mocks.fetchStates[mocks.fetchIndex++] ?? {
        data: undefined,
        error: undefined,
        isLoading: false,
      }
    )
  },
}))
vi.mock("./account-linking-view", () => ({
  AccountLinkingView: ({
    currentProfile,
    linkedProfile,
    messageId,
  }: {
    currentProfile: { id: string }
    linkedProfile: { id: string }
    messageId: string
  }) => (
    <div data-testid='account-linking'>
      {currentProfile.id}:{linkedProfile.id}:{messageId}
    </div>
  ),
}))
vi.mock("./service-error", () => ({
  ServiceError: () => <div role='alert'>service error</div>,
}))

import { SecureMessagePage } from "./secure-message-page"

const idle = (): FetchState => ({ isLoading: false })
const profile = (id: string, primaryUserId = id) => ({
  id,
  primaryUserId,
  email: `${id}@example.ie`,
})

describe("SecureMessagePage", () => {
  beforeEach(() => {
    mocks.replace.mockReset()
    mocks.searchParams = new URLSearchParams("id=message-id")
    mocks.fetchStates = []
    mocks.fetchCalls = []
    mocks.fetchIndex = 0
  })

  it("shows an error without a message id", () => {
    mocks.searchParams = new URLSearchParams()
    mocks.fetchStates = [idle(), idle(), idle(), idle()]

    render(<SecureMessagePage />)

    expect(screen.getByRole("alert")).toHaveTextContent("service error")
    expect(mocks.fetchCalls[0]).toEqual([null])
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("redirects directly when the current user can access the message", async () => {
    mocks.fetchStates = [
      { data: { recipientUserId: "current-user-id" }, isLoading: false },
      idle(),
      idle(),
      idle(),
    ]

    render(<SecureMessagePage />)

    expect(screen.getByLabelText("Loading")).toBeInTheDocument()
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/en/messages?id=message-id")
    })
    expect(mocks.fetchCalls[0]).toEqual([
      "/messaging/api/v1/messages/message-id",
    ])
    expect(mocks.fetchCalls[1]).toEqual([null, { actorType: "m2m" }])
  })

  it("uses the M2M fallback and presents unlinked profiles", () => {
    mocks.fetchStates = [
      { error: { status: 403 }, isLoading: false },
      {
        data: { recipientUserId: "linked-user-id" },
        isLoading: false,
      },
      { data: profile("linked-user-id"), isLoading: false },
      { data: profile("current-profile-id"), isLoading: false },
    ]

    render(<SecureMessagePage />)

    expect(screen.getByTestId("account-linking")).toHaveTextContent(
      "current-profile-id:linked-user-id:message-id",
    )
    expect(mocks.fetchCalls).toEqual([
      ["/messaging/api/v1/messages/message-id"],
      ["/messaging/api/v1/messages/message-id", { actorType: "m2m" }],
      ["/profile/api/v1/profiles/linked-user-id", { actorType: "m2m" }],
      ["/profile/api/v1/profiles/current-user-id"],
    ])
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("redirects home when the recipient profile is already linked", async () => {
    mocks.fetchStates = [
      { error: { status: 404 }, isLoading: false },
      {
        data: { recipientUserId: "linked-user-id" },
        isLoading: false,
      },
      {
        data: profile("linked-user-id", "different-primary-id"),
        isLoading: false,
      },
      { data: profile("current-profile-id"), isLoading: false },
    ]

    render(<SecureMessagePage />)

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/en/messages")
    })
    expect(screen.getByLabelText("Loading")).toBeInTheDocument()
  })

  it("shows an error without attempting M2M for other gateway failures", () => {
    mocks.fetchStates = [
      { error: { status: 500 }, isLoading: false },
      idle(),
      idle(),
      idle(),
    ]

    render(<SecureMessagePage />)

    expect(screen.getByRole("alert")).toHaveTextContent("service error")
    expect(mocks.fetchCalls[1]).toEqual([null, { actorType: "m2m" }])
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
