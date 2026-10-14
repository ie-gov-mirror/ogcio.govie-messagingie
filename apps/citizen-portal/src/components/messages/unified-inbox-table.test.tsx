import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { InboxListChromeHeader } from "@/components/messages/inbox-list-chrome-header"
import { UnifiedInboxTable } from "@/components/messages/unified-inbox-table"
import tableStyles from "@/components/messages/unified-inbox-table.module.css"
import { useMessageSelection } from "@/components/messages/use-message-selection"
import type { Message } from "@/types"

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockReplaceState = vi.fn()
let currentSearchParams = new URLSearchParams()
const MOCK_PATHNAME = "/en/messages"

function syncSearchParamsFromHistoryUrl(url: string | URL | null | undefined) {
  if (typeof url !== "string") return
  const parsed = new URL(url, "http://localhost")
  currentSearchParams = new URLSearchParams(parsed.search)
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => currentSearchParams,
  usePathname: () => MOCK_PATHNAME,
}))

/**
 * The `<SenderName>` component looks up `organisationId` against the
 * profile service via SWR, so the table now triggers a real network
 * dependency in jsdom. We stub the SWR-backed hook with a synchronous
 * fixture map so tests can assert the resolved org name without spinning
 * up a fake fetch + suspending on micro-tasks. Unknown ids fall through
 * to `data: undefined`, which the component renders as the localized
 * "Unknown sender" fallback — useful for the negative-path test below.
 */
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
  "org-dsp": {
    id: "org-dsp",
    translations: {
      en: {
        name: "Department of Social Protection",
        shortName: "DSP",
      },
      ga: {
        name: "An Roinn Coimirce Sóisialaí",
        shortName: "RCS",
      },
    },
  },
  "org-rev": {
    id: "org-rev",
    translations: {
      en: { name: "Revenue", shortName: "REV" },
      ga: { name: "Na Coimisinéirí Ioncaim", shortName: "NCI" },
    },
  },
}

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayFetch: (path: string | null) => {
    if (!path) {
      return {
        data: undefined,
        metadata: undefined,
        error: null,
        isLoading: false,
        refresh: vi.fn(),
      }
    }
    const orgMatch = path.match(/^\/profile\/api\/v1\/organisations\/(.+)$/)
    const data = orgMatch ? ORG_FIXTURES[orgMatch[1]] : undefined
    return {
      data,
      metadata: undefined,
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    }
  },
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    (namespace: string) =>
    (key: string, params?: { [k: string]: string | number }) => {
      const translations: Record<string, string> = {
        "home.table.aria.messageList": "Message list",
        "home.table.column.sender": "Sender",
        "home.table.column.status": "Status",
        "home.table.column.date": "Date",
        "home.table.column.details": "Details",
        "home.table.column.attachment": "Attachment",
        "home.table.rowsPerPage": "Rows per page",
        "home.table.from": "From",
        "home.table.unknownSender": "Unknown sender",
        "home.table.systemSender.support": "MessagingIE",
        "home.table.empty.all": "You have no messages",
        "home.table.select": "Select",
        "home.table.selectAll": "Select All",
        "home.table.close": "Close",
        "home.table.ariaLabel.selectAll": "Select all messages on this page",
        "search.input.placeholder": "Search",
        "search.button.search": "Search",
        "search.button.reset": "Reset",
        "home.table.filter.button": "Filters",
        "home.table.filter.unread": "Unread",
        "home.table.filter.read": "Read",
        "home.table.filter.status": "Filter by status",
        "home.table.filter.apply": "Apply",
        "home.table.filter.clear": "Clear",
      }

      const value = translations[`${namespace}.${key}`]
      if (key === "attachment") {
        return (Number(params?.count) || 0) === 1 ? "attachment" : "attachments"
      }
      if (key === "unreadCount") {
        const count = Number(params?.count) || 0
        return `${count} unread`
      }
      if (key === "selectedCount") {
        const count = Number(params?.count) || 0
        return `${count} selected`
      }
      if (namespace === "home.delete.toolbar" && key === "delete") {
        return "Delete"
      }
      if (namespace === "home.table" && key === "ariaLabel.selectRow") {
        return `Select message from ${params?.sender}: ${params?.subject}`
      }
      return value ?? key
    },
}))

// `threadName` mirrors `subject` here on purpose: that's how the
// messaging-api list endpoint actually returns rows (the field is a
// grouping key, not a sender name). Pinning the fixture this way locks
// in the AB#37868 regression — the Sender column must resolve from
// `organisationId` via the profile lookup, never echo `threadName` /
// `subject` back at the user.
const baseMessage: Message = {
  id: "msg-1",
  subject: "Your annual statement is available",
  createdAt: "2025-01-15T10:30:00Z",
  threadName: "Your annual statement is available",
  organisationId: "org-dsp",
  recipientUserId: "user-1",
  excerpt: "Please review your updated annual statement in the portal.",
  isSeen: false,
  attachmentsCount: 1,
}

const messages: Message[] = [
  baseMessage,
  {
    ...baseMessage,
    id: "msg-2",
    subject: "Payment confirmation",
    threadName: "Payment confirmation",
    organisationId: "org-rev",
    isSeen: true,
    attachmentsCount: 0,
  },
]

const defaultProps = {
  messages,
  isLoading: false,
  onSelect: vi.fn(),
  pageSize: 10,
  onPageSizeChange: vi.fn(),
}

function InboxListChrome({
  children,
  bulkActionBar,
  showToolbar = false,
}: {
  children: ReactNode
  bulkActionBar?: ReactNode
  showToolbar?: boolean
}) {
  return (
    <div className={tableStyles.listChrome}>
      <InboxListChromeHeader
        showToolbar={showToolbar}
        bulkActionBar={bulkActionBar}
      />
      {children}
    </div>
  )
}

// Wrapper that wires a real useMessageSelection hook into the table so
// interaction tests can drive the checkbox / select-all columns. Per-row
// deletion is intentionally omitted: the bulk toolbar covers single-message
// deletion via the row checkbox.
function TableWithSelection(
  props: {
    selectMode?: boolean
    onEnterSelectMode?: () => void
    onExitSelectMode?: () => void
    onOpenFolders?: () => void
    onBulkMove?: () => void
    canMove?: boolean
    bulkActionBar?: ReactNode
  } = {},
) {
  const selection = useMessageSelection(messages)
  // The mobile "Select" button (data-testid=mobile-select-button) is
  // gated on a truthy onEnterSelectMode handler — its absence is how
  // the messages page tells the table that mobile select-mode is not
  // wired up. The default wrapper supplies a no-op so the button is
  // rendered for assertions; tests that exercise the click handler
  // pass their own spy.
  return (
    <InboxListChrome
      showToolbar={selection.selectedCount > 0}
      bulkActionBar={props.bulkActionBar}
    >
      <UnifiedInboxTable
        {...defaultProps}
        selection={selection}
        selectMode={props.selectMode}
        onEnterSelectMode={props.onEnterSelectMode ?? (() => {})}
        onExitSelectMode={props.onExitSelectMode ?? (() => {})}
        onOpenFolders={props.onOpenFolders}
        onBulkMove={props.onBulkMove}
        canMove={props.canMove}
      />
    </InboxListChrome>
  )
}

function renderInboxTable(props: ComponentProps<typeof UnifiedInboxTable>) {
  return render(
    <InboxListChrome>
      <UnifiedInboxTable {...props} />
    </InboxListChrome>,
  )
}

describe("UnifiedInboxTable", () => {
  beforeEach(() => {
    currentSearchParams = new URLSearchParams()
    mockPush.mockClear()
    mockReplace.mockClear()
    mockReplaceState.mockClear()
    vi.spyOn(window.history, "replaceState").mockImplementation(
      (_state, _title, url) => {
        mockReplaceState(url)
        syncSearchParamsFromHistoryUrl(url)
      },
    )
  })

  it("renders search input and table", () => {
    renderInboxTable({ ...defaultProps })

    expect(screen.getByTestId("search-input")).toBeInTheDocument()
    expect(screen.getByTestId("unified-inbox-table")).toBeInTheDocument()
    expect(
      screen.getByRole("table", { name: "Message list" }),
    ).toBeInTheDocument()
  })

  it("preserves the current folder in message detail links", () => {
    currentSearchParams = new URLSearchParams({ folder: "folder-1" })
    renderInboxTable({ ...defaultProps })

    expect(screen.getByTestId("message-row-link-msg-1")).toHaveAttribute(
      "href",
      "/en/messages?folder=folder-1&id=msg-1",
    )
  })

  it("shows all messages regardless of read state", () => {
    renderInboxTable({ ...defaultProps })

    expect(
      screen.getAllByText("Your annual statement is available").length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText("Payment confirmation").length).toBeGreaterThan(
      0,
    )
  })

  // AB#37868 regression: the Sender column must surface the
  // organisation's localized display name resolved from
  // `organisationId`, never `threadName` (which the messaging-api wires
  // up to the subject for thread grouping). The fixtures above
  // intentionally set `threadName === subject`, so a sloppy "show
  // whatever's in threadName" implementation would render the subject
  // in this column.
  it("renders the resolved organisation name in the Sender column", () => {
    renderInboxTable({ ...defaultProps })

    const senderTexts = Array.from(
      screen
        .getByTestId("unified-inbox-table")
        .querySelectorAll<HTMLElement>("tbody tr td:nth-child(1) span"),
    ).map((node) => node.textContent?.trim())

    expect(senderTexts).toEqual(["Department of Social Protection", "Revenue"])
    // The subject must NOT leak into the Sender column even though
    // `threadName === subject` for both rows.
    expect(senderTexts).not.toContain("Your annual statement is available")
    expect(senderTexts).not.toContain("Payment confirmation")
  })

  it("falls back to the unknown-sender label when the organisation lookup has no data", () => {
    const orphan: Message[] = [
      {
        ...baseMessage,
        id: "msg-orphan",
        subject: "Quarterly tax return reminder",
        threadName: "Quarterly tax return reminder",
        organisationId: "org-not-seeded",
      },
    ]

    renderInboxTable({ ...defaultProps, messages: orphan })

    const senderTexts = Array.from(
      screen
        .getByTestId("unified-inbox-table")
        .querySelectorAll<HTMLElement>("tbody tr td:nth-child(1) span"),
    ).map((node) => node.textContent?.trim())

    expect(senderTexts).toEqual(["Unknown sender"])
    // Defensive: the subject must NOT be used as a fallback either, even
    // when the org lookup misses.
    expect(senderTexts).not.toContain("Quarterly tax return reminder")
    // Raw UUID must never reach the UI.
    expect(senderTexts).not.toContain("org-not-seeded")
  })

  // AB#37866 regression: messages produced by the messaging-api itself
  // (e.g. data-export-ready notifications) carry `organisationId =
  // "support"`, which is the literal default of the messaging-api
  // SUPPORT_ORGANISATION_ID env var, NOT a real UUID. The Sender column
  // must short-circuit the doomed profile lookup for these and render a
  // localized brand label instead of the "Unknown sender" fallback.
  it("renders the system-sender brand label for messages stamped with the support slug", () => {
    const systemMessage: Message[] = [
      {
        ...baseMessage,
        id: "msg-system",
        subject: "Your MessagingIE Data Export is Ready",
        threadName: "Your MessagingIE Data Export is Ready",
        organisationId: "support",
      },
    ]

    renderInboxTable({ ...defaultProps, messages: systemMessage })

    const senderTexts = Array.from(
      screen
        .getByTestId("unified-inbox-table")
        .querySelectorAll<HTMLElement>("tbody tr td:nth-child(1) span"),
    ).map((node) => node.textContent?.trim())

    expect(senderTexts).toEqual(["MessagingIE"])
    // The slug must NEVER reach the UI raw, and the unknown-sender
    // fallback must NEVER fire for known system slugs.
    expect(senderTexts).not.toContain("support")
    expect(senderTexts).not.toContain("Unknown sender")
  })

  it("does not render an unread count below the search header", () => {
    renderInboxTable({ ...defaultProps })

    expect(screen.queryByText("1 unread")).not.toBeInTheDocument()
  })

  it("pushes search query after debounce", async () => {
    vi.useFakeTimers()
    const { rerender } = renderInboxTable({ ...defaultProps })

    const input = screen.getByTestId("search-input")
    fireEvent.change(input, { target: { value: "statement" } })

    expect(screen.getByTestId("search-pending-spinner")).toBeInTheDocument()
    expect(mockReplaceState).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)

    expect(mockReplaceState).toHaveBeenCalledWith(
      `${MOCK_PATHNAME}?search=statement`,
    )

    currentSearchParams = new URLSearchParams("search=statement")
    rerender(
      <InboxListChrome key={currentSearchParams.toString()}>
        <UnifiedInboxTable {...defaultProps} />
      </InboxListChrome>,
    )
    expect(
      screen.queryByTestId("search-pending-spinner"),
    ).not.toBeInTheDocument()

    currentSearchParams = new URLSearchParams()
    vi.useRealTimers()
  })

  it("pushes search query immediately on Enter", () => {
    renderInboxTable({ ...defaultProps })

    const input = screen.getByTestId("search-input")
    fireEvent.change(input, { target: { value: "statement" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(mockReplaceState).toHaveBeenCalledWith(
      `${MOCK_PATHNAME}?search=statement`,
    )
  })

  it("clears the ?search= param when the debounced input becomes empty", async () => {
    vi.useFakeTimers()
    currentSearchParams = new URLSearchParams("search=available")
    try {
      renderInboxTable({ ...defaultProps })

      const input = screen.getByTestId("search-input")
      fireEvent.change(input, { target: { value: "" } })
      vi.advanceTimersByTime(500)

      expect(mockReplaceState).toHaveBeenCalledWith(MOCK_PATHNAME)
    } finally {
      currentSearchParams = new URLSearchParams()
      vi.useRealTimers()
    }
  })

  it("clears the ?search= param when the input clear button is clicked", () => {
    currentSearchParams = new URLSearchParams("search=available")
    try {
      renderInboxTable({ ...defaultProps })

      fireEvent.click(screen.getByRole("button", { name: "Clear input" }))

      expect(mockReplaceState).toHaveBeenCalledWith(MOCK_PATHNAME)
      expect(screen.getByTestId("search-input")).toHaveValue("")
    } finally {
      currentSearchParams = new URLSearchParams()
    }
  })

  it("clears search loaded from the URL after reload and dismisses the spinner", () => {
    currentSearchParams = new URLSearchParams("limit=20&search=payslip")
    try {
      const { rerender } = renderInboxTable({ ...defaultProps })

      expect(screen.getByTestId("search-input")).toHaveValue("payslip")

      fireEvent.click(screen.getByRole("button", { name: "Clear input" }))

      expect(mockReplaceState).toHaveBeenCalledWith(`${MOCK_PATHNAME}?limit=20`)

      rerender(
        <InboxListChrome key='search-cleared'>
          <UnifiedInboxTable {...defaultProps} />
        </InboxListChrome>,
      )

      expect(screen.getByTestId("search-input")).toHaveValue("")
      expect(
        screen.queryByTestId("search-pending-spinner"),
      ).not.toBeInTheDocument()
    } finally {
      currentSearchParams = new URLSearchParams()
    }
  })

  it("pushes status=unread when the unread filter is applied", () => {
    renderInboxTable({ ...defaultProps })

    fireEvent.click(screen.getByTestId("status-filter"))
    fireEvent.click(screen.getByLabelText("Unread"))
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(mockPush).toHaveBeenCalledWith(`${MOCK_PATHNAME}?status=unread`)
  })

  it("pushes status=read when the read filter is applied", () => {
    renderInboxTable({ ...defaultProps })

    fireEvent.click(screen.getByTestId("status-filter"))
    fireEvent.click(screen.getByLabelText("Read"))
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(mockPush).toHaveBeenCalledWith(`${MOCK_PATHNAME}?status=read`)
  })

  it("clears status from the URL when filters are cleared", () => {
    currentSearchParams = new URLSearchParams("status=unread")
    try {
      renderInboxTable({ ...defaultProps })

      fireEvent.click(screen.getByTestId("status-filter"))
      fireEvent.click(screen.getByRole("button", { name: "Clear" }))

      expect(mockPush).toHaveBeenCalledWith(MOCK_PATHNAME)
    } finally {
      currentSearchParams = new URLSearchParams()
    }
  })

  it("shows loading state", () => {
    renderInboxTable({ ...defaultProps, messages: [], isLoading: true })

    // Spinner is rendered inside an <output aria-label="Loading"> wrapper
    // (the shared <MessagesLoading /> component used by the page-level
    // suspense fallback), so we assert on the accessible label rather than
    // on the previous "Loading messages..." copy.
    expect(screen.getByLabelText("Loading")).toBeInTheDocument()
  })

  it("shows empty state when no messages", () => {
    renderInboxTable({ ...defaultProps, messages: [] })

    expect(screen.getByText("You have no messages")).toBeInTheDocument()
  })

  it("does not render a per-row delete control (deletion goes through the bulk toolbar)", () => {
    render(<TableWithSelection />)

    expect(screen.queryByTestId("delete-row-msg-1")).not.toBeInTheDocument()
    expect(screen.queryByTestId("delete-row-msg-2")).not.toBeInTheDocument()
  })

  it("checkbox selection shows the right checked state", () => {
    render(<TableWithSelection />)

    const rowCheckbox = screen.getByTestId(
      "select-row-msg-1",
    ) as HTMLInputElement
    expect(rowCheckbox.checked).toBe(false)
    fireEvent.click(rowCheckbox)
    expect(rowCheckbox.checked).toBe(true)
  })

  it("select-all toggles every visible row", () => {
    render(<TableWithSelection />)

    const selectAll = screen.getByTestId(
      "select-all-checkbox",
    ) as HTMLInputElement
    fireEvent.click(selectAll)

    expect(
      (screen.getByTestId("select-row-msg-1") as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      (screen.getByTestId("select-row-msg-2") as HTMLInputElement).checked,
    ).toBe(true)
  })

  it("select-all is indeterminate when some — but not all — rows are selected", () => {
    render(<TableWithSelection />)

    // The DS InputCheckbox does NOT imperatively flip the native
    // HTMLInputElement.indeterminate property — see the comment block on
    // `selectionCheckboxProps` in unified-inbox-table.tsx. It signals the
    // mixed state via (a) aria-checked="mixed" and (b) the
    // .gi-checkbox-indeterminate class that drives the dash-on-fill visual.
    // Asserting on `.indeterminate` directly is a false negative; the
    // assertions below pin the contract the screen reader and the CSS
    // actually rely on.
    //
    // The DS component also recreates its internal <input> when the
    // `indeterminate`/`checked` prop combination flips, so we must
    // re-query the testid after each interaction rather than caching a
    // stale node reference.
    const initial = screen.getByTestId(
      "select-all-checkbox",
    ) as HTMLInputElement
    expect(initial.checked).toBe(false)
    expect(initial.getAttribute("aria-checked")).not.toBe("mixed")
    expect(initial.className).not.toMatch(/gi-checkbox-indeterminate/)

    fireEvent.click(screen.getByTestId("select-row-msg-1"))

    const partial = screen.getByTestId(
      "select-all-checkbox",
    ) as HTMLInputElement
    expect(partial.checked).toBe(true)
    expect(partial.className).toMatch(/gi-checkbox-indeterminate/)

    fireEvent.click(screen.getByTestId("select-row-msg-2"))

    const full = screen.getByTestId("select-all-checkbox") as HTMLInputElement
    expect(full.checked).toBe(true)
    expect(full.className).not.toMatch(/gi-checkbox-indeterminate/)
  })

  it("mobile select-all header appears when rows are selected even if the explicit mobile select mode is off", () => {
    // Simulates the cross-viewport case: the user selects rows via the
    // desktop checkboxes (which are always visible on desktop) and then
    // resizes down to a mobile viewport without ever tapping the mobile
    // "Select" button. The bulk banner + mobile select header must reflect
    // the non-empty selection instead of the default "(N) unread" header.
    render(<TableWithSelection />)

    expect(screen.getByTestId("mobile-select-button")).toBeInTheDocument()
    expect(
      screen.queryByTestId("mobile-select-all-checkbox"),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("select-row-msg-1"))

    expect(screen.getByTestId("mobile-select-all-checkbox")).toBeInTheDocument()
    expect(screen.getByTestId("mobile-select-close")).toBeInTheDocument()
    expect(screen.queryByTestId("mobile-select-button")).not.toBeInTheDocument()
  })

  it("mobile Select button calls onEnterSelectMode", () => {
    const onEnterSelectMode = vi.fn()
    render(<TableWithSelection onEnterSelectMode={onEnterSelectMode} />)

    fireEvent.click(screen.getByTestId("mobile-select-button"))
    expect(onEnterSelectMode).toHaveBeenCalledTimes(1)
  })

  it("renders a mobile Folders button that opens the folder panel", () => {
    const onOpenFolders = vi.fn()
    render(<TableWithSelection onOpenFolders={onOpenFolders} />)

    fireEvent.click(screen.getByTestId("mobile-folders-button"))
    expect(onOpenFolders).toHaveBeenCalledTimes(1)
  })

  it("shows a mobile Move button in select mode only when canMove is set", () => {
    const onBulkMove = vi.fn()
    render(<TableWithSelection canMove onBulkMove={onBulkMove} />)

    // Enter select mode by selecting a row.
    fireEvent.click(screen.getByTestId("select-row-msg-1"))

    fireEvent.click(screen.getByTestId("bulk-move-button-mobile"))
    expect(onBulkMove).toHaveBeenCalledTimes(1)
  })

  it("hides the mobile Move button when canMove is false", () => {
    render(<TableWithSelection onBulkMove={vi.fn()} canMove={false} />)

    fireEvent.click(screen.getByTestId("select-row-msg-1"))

    expect(
      screen.queryByTestId("bulk-move-button-mobile"),
    ).not.toBeInTheDocument()
  })

  it("mobile Close button exits select mode and clears selection", () => {
    const onExitSelectMode = vi.fn()
    render(
      <TableWithSelection selectMode onExitSelectMode={onExitSelectMode} />,
    )

    fireEvent.click(screen.getByTestId("mobile-select-close"))
    expect(onExitSelectMode).toHaveBeenCalledTimes(1)
  })

  it("renders the bulkActionBar slot exactly once when rows are selected", () => {
    render(
      <TableWithSelection
        bulkActionBar={<div data-testid='bulk-action-bar-slot'>banner</div>}
      />,
    )

    fireEvent.click(screen.getByTestId("select-row-msg-1"))

    expect(screen.getAllByTestId("bulk-action-bar-slot")).toHaveLength(1)
    expect(screen.getByText("1 selected")).toBeInTheDocument()
  })

  it("shows the bulk toolbar in place of search when rows are selected", () => {
    render(
      <TableWithSelection
        bulkActionBar={<div data-testid='bulk-action-bar-slot'>banner</div>}
      />,
    )

    fireEvent.click(screen.getByTestId("select-row-msg-1"))

    expect(screen.getByTestId("bulk-action-bar-slot")).toBeVisible()
    expect(
      screen.getByTestId("search-input").closest("[aria-hidden='true']"),
    ).not.toBeNull()
  })
})
