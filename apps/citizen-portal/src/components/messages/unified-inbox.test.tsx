import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPush = vi.hoisted(() => vi.fn())

let currentSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/en/messages",
  useSearchParams: () => currentSearchParams,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const listState = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  isLoading: false,
}))

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayFetch: () => ({
    data: listState.data,
    metadata: { totalCount: listState.data.length },
    isLoading: listState.isLoading,
    refresh: vi.fn(),
  }),
}))

const ONE_MESSAGE = {
  id: "msg-1",
  subject: "Your annual statement is available",
  createdAt: "2025-01-15T10:30:00Z",
  threadName: "Your annual statement is available",
  organisationId: "org-dsp",
  recipientUserId: "user-1",
  isSeen: false,
  attachmentsCount: 0,
}

vi.mock("@/mock/messages", () => ({
  MOCK_MESSAGES_ENABLED: false,
  getMockMessagesPage: () => [],
  getMockMessagesTotalCount: () => 0,
  findMockMessageById: () => null,
}))

// Render the sidebar slot too: the folders flag (AB#42582) decides whether
// `UnifiedInboxPage` passes one, so swallowing it would hide the gating.
vi.mock("@/components/messages/inbox-layout", () => ({
  InboxLayout: ({
    sidebar,
    children,
  }: {
    sidebar?: React.ReactNode
    children: React.ReactNode
  }) => (
    <div>
      {sidebar}
      {children}
    </div>
  ),
}))

vi.mock("@/components/messages/message-folders-sidebar", () => ({
  INBOX_FOLDER_ID: "inbox",
  DELETED_FOLDER_ID: "deleted",
  MessageFoldersSidebar: () => <nav data-testid='folders-sidebar' />,
}))

vi.mock("@/components/messages/message-detail-view", () => ({
  MessageDetailView: () => null,
}))

// Surface the folder-gated props so the specs can assert on them without
// pulling in the real (heavy) table.
vi.mock("@/components/messages/unified-inbox-table", () => ({
  UnifiedInboxTable: ({
    canMove,
    onOpenFolders,
    onSelect,
  }: {
    canMove?: boolean
    onOpenFolders?: () => void
    onSelect: (id: string) => void
  }) => (
    <div
      data-testid='inbox-table'
      data-can-move={String(Boolean(canMove))}
      data-can-open-folders={String(Boolean(onOpenFolders))}
    >
      <button type='button' onClick={() => onSelect("msg-1")}>
        Open message
      </button>
    </div>
  ),
}))

vi.mock("@/components/messages/bulk-action-toolbar", () => ({
  BulkActionToolbar: () => null,
}))

vi.mock("@/components/messages/delete-confirmation-modal", () => ({
  DeleteConfirmationModal: () => null,
}))

vi.mock("@/components/messages/delete-result-toast", () => ({
  DeleteResultToast: () => null,
}))

vi.mock("@/components/messages/mobile-folder-panel", () => ({
  MobileFolderPanel: () => <div data-testid='mobile-folder-panel' />,
}))

vi.mock("@/components/messages/move-message-modal", () => ({
  MoveMessageModal: () => <div data-testid='move-message-modal' />,
}))

vi.mock("@/components/messages/move-result-toast", () => ({
  MoveResultToast: () => null,
}))

vi.mock("@/components/messages/use-delete-messages", () => ({
  useDeleteMessages: () => ({
    deleteIds: vi.fn(),
    isLoading: false,
    lastResult: null,
    dismissResult: vi.fn(),
  }),
}))

vi.mock("@/components/messages/use-move-messages", () => ({
  useMoveMessages: () => ({
    moveIds: vi.fn(),
    isLoading: false,
    lastResult: null,
    dismissResult: vi.fn(),
  }),
}))

// Folders are a build-time flag (AB#42582). `destinations` also has to be
// non-empty for `canMove`, so both are driven per spec.
const flagState = vi.hoisted(() => ({
  folders: true,
  destinations: [{ id: "folder-1", label: "EHIC" }] as Array<{
    id: string
    label: string
  }>,
}))

vi.mock("@/lib/feature-config", () => ({
  isFoldersEnabled: () => flagState.folders,
}))

vi.mock("@/components/messages/use-message-folders", () => ({
  useMessageFolders: () => flagState.destinations,
}))

import { UnifiedInboxPage } from "@/components/messages/unified-inbox"
import { fakeAnalytics } from "../../../test/utils/analytics"

const analytics = fakeAnalytics()
const { render } = analytics
const trackEvent = analytics.event

describe("UnifiedInboxPage analytics", () => {
  beforeEach(() => {
    trackEvent.mockClear()
    mockPush.mockClear()
    currentSearchParams = new URLSearchParams()
    listState.data = []
    listState.isLoading = false
    flagState.folders = true
    flagState.destinations = [{ id: "folder-1", label: "EHIC" }]
  })

  it("fires message-list-view on mount", () => {
    render(<UnifiedInboxPage />)

    expect(trackEvent).toHaveBeenCalledWith({
      event: {
        name: "message-list-view",
        category: "Message",
        action: "Message List Viewed",
      },
    })
  })

  it("fires message-list-view only once across re-renders", () => {
    const { rerender } = render(<UnifiedInboxPage />)
    rerender(<UnifiedInboxPage />)

    const listViewCalls = trackEvent.mock.calls.filter(
      ([arg]) => arg.event.name === "message-list-view",
    )
    expect(listViewCalls).toHaveLength(1)
  })

  const searches = () =>
    trackEvent.mock.calls.filter(([call]) => call.event.category === "Search")

  it("reports a search once its results load, without the search text", () => {
    currentSearchParams = new URLSearchParams({ search: "tax refund" })
    const { rerender } = render(<UnifiedInboxPage />)
    rerender(<UnifiedInboxPage />)

    expect(searches()).toEqual([
      [
        {
          event: {
            name: "messages-searched",
            category: "Search",
            action: "Messages Searched",
            value: 0,
          },
        },
      ],
    ])
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain("tax refund")
  })

  it("does not report the same search again when the page changes", () => {
    currentSearchParams = new URLSearchParams({ search: "tax refund" })
    const { rerender } = render(<UnifiedInboxPage />)
    currentSearchParams = new URLSearchParams({
      search: "tax refund",
      page: "2",
    })
    rerender(<UnifiedInboxPage />)

    expect(searches()).toHaveLength(1)
  })

  it("reports nothing without a search", () => {
    render(<UnifiedInboxPage />)

    expect(searches()).toEqual([])
  })
})

describe("UnifiedInboxPage empty states", () => {
  beforeEach(() => {
    currentSearchParams = new URLSearchParams()
    listState.data = []
    listState.isLoading = false
  })

  it("replaces search, filters and the list with an alert when the inbox has no messages", () => {
    render(<UnifiedInboxPage />)

    const alert = screen.getByTestId("messages-empty")
    expect(alert).toHaveTextContent("inbox.title")
    expect(alert).toHaveTextContent("inbox.description")
    expect(screen.queryByTestId("inbox-table")).not.toBeInTheDocument()
    expect(screen.queryByTestId("search-input")).not.toBeInTheDocument()
  })

  it("explains an empty Deleted folder", () => {
    currentSearchParams = new URLSearchParams({ folder: "deleted" })

    render(<UnifiedInboxPage />)

    const alert = screen.getByTestId("messages-empty")
    expect(alert).toHaveTextContent("deleted.title")
    expect(alert).toHaveTextContent("deleted.description")
  })

  it("keeps search and the list when a search returns nothing", () => {
    currentSearchParams = new URLSearchParams({ search: "payslip" })

    render(<UnifiedInboxPage />)

    expect(screen.queryByTestId("messages-empty")).not.toBeInTheDocument()
    expect(screen.getByTestId("inbox-table")).toBeInTheDocument()
    expect(screen.getByTestId("search-input")).toBeInTheDocument()
  })

  it("keeps search and the list when a status filter returns nothing", () => {
    currentSearchParams = new URLSearchParams({ status: "unread" })

    render(<UnifiedInboxPage />)

    expect(screen.queryByTestId("messages-empty")).not.toBeInTheDocument()
    expect(screen.getByTestId("inbox-table")).toBeInTheDocument()
  })

  it("never shows the empty alert while messages are loading", () => {
    listState.isLoading = true

    render(<UnifiedInboxPage />)

    expect(screen.queryByTestId("messages-empty")).not.toBeInTheDocument()
    expect(screen.getByTestId("inbox-table")).toBeInTheDocument()
  })
})

describe("UnifiedInboxPage folders flag (AB#42582)", () => {
  beforeEach(() => {
    trackEvent.mockClear()
    currentSearchParams = new URLSearchParams()
    listState.data = [ONE_MESSAGE]
    listState.isLoading = false
    flagState.folders = true
    flagState.destinations = [{ id: "folder-1", label: "EHIC" }]
  })

  it("shows the Messages heading and keeps Move, without the folder sidebar", () => {
    render(<UnifiedInboxPage />)

    expect(
      screen.getByRole("heading", { level: 1, name: "heading" }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("folders-sidebar")).not.toBeInTheDocument()
    expect(screen.queryByTestId("mobile-folder-panel")).not.toBeInTheDocument()
    expect(screen.getByTestId("move-message-modal")).toBeInTheDocument()

    const table = screen.getByTestId("inbox-table")
    expect(table).toHaveAttribute("data-can-move", "true")
    expect(table).toHaveAttribute("data-can-open-folders", "false")
  })

  it("drops Move when the flag is off and still has no folder sidebar", () => {
    flagState.folders = false

    render(<UnifiedInboxPage />)

    expect(screen.queryByTestId("folders-sidebar")).not.toBeInTheDocument()
    expect(screen.queryByTestId("mobile-folder-panel")).not.toBeInTheDocument()
    expect(screen.queryByTestId("move-message-modal")).not.toBeInTheDocument()

    const table = screen.getByTestId("inbox-table")
    expect(table).toHaveAttribute("data-can-move", "false")
    expect(table).toHaveAttribute("data-can-open-folders", "false")
  })

  it("keeps Move hidden in the Deleted view even with the flag on", () => {
    currentSearchParams = new URLSearchParams({ folder: "deleted" })

    render(<UnifiedInboxPage />)

    expect(screen.getByTestId("inbox-table")).toHaveAttribute(
      "data-can-move",
      "false",
    )
  })

  it("preserves the current folder when opening a message", () => {
    currentSearchParams = new URLSearchParams({ folder: "folder-1" })
    render(<UnifiedInboxPage />)

    screen.getByRole("button", { name: "Open message" }).click()

    expect(mockPush).toHaveBeenCalledWith(
      "/en/messages?folder=folder-1&id=msg-1",
      { scroll: false },
    )
  })

  it("hides Move when the flag is on but no destination folders exist", () => {
    flagState.destinations = []

    render(<UnifiedInboxPage />)

    expect(screen.getByTestId("inbox-table")).toHaveAttribute(
      "data-can-move",
      "false",
    )
  })

  it("omits the sidebar on the detail route", () => {
    currentSearchParams = new URLSearchParams({ id: "msg-1" })

    render(<UnifiedInboxPage />)

    expect(screen.queryByTestId("folders-sidebar")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { level: 1, name: "heading" }),
    ).not.toBeInTheDocument()
  })
})
