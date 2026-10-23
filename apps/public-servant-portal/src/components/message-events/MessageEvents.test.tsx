import { flexRender } from "@tanstack/react-table"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import EventTable from "./EventTable"
import { MessageEventDetailClient } from "./message-event-detail-client"
import { MessageEventsPageClient } from "./message-events-page-client"
import { SearchBar } from "./SearchBar"

const { fetchMock, pushMock, searchParamsMock, toasterCreate } = vi.hoisted(
  () => {
    process.env.NEXT_PUBLIC_BASE_URL ??= "http://localhost:3022"
    process.env.NEXT_PUBLIC_SAG_URL ??= "http://localhost:3030"

    return {
      fetchMock: vi.fn(),
      pushMock: vi.fn(),
      searchParamsMock: new URLSearchParams(),
      toasterCreate: vi.fn(),
    }
  },
)

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayFetch: (path: string | null) => fetchMock(path),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/message-events",
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock,
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))

vi.mock("@ogcio/design-system-react", () => ({
  Button: ({
    children,
    onClick,
    type = "button",
  }: {
    children: ReactNode
    onClick?: () => void
    type?: "button"
  }) => (
    <button type={type} onClick={onClick}>
      {children}
    </button>
  ),
  FormField: ({
    children,
    label,
  }: {
    children: ReactNode
    label: { text: string; htmlFor: string }
  }) => (
    <div>
      <label htmlFor={label.htmlFor}>{label.text}</label>
      {children}
    </div>
  ),
  Heading: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
  InputText: ({
    id,
    name,
    type = "text",
    value,
    onChange,
    onKeyDown,
    placeholder,
  }: {
    id: string
    name: string
    type?: string
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
    placeholder?: string
  }) => (
    <input
      id={id}
      name={name}
      type={type}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
    />
  ),
  Link: ({ children, href }: { children: ReactNode; href?: string }) => (
    <a href={href}>{children}</a>
  ),
  Paragraph: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  Select: ({ children, id }: { children: ReactNode; id: string }) => (
    <select id={id}>{children}</select>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  Spinner: () => <span data-testid='spinner' />,
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  toaster: { create: toasterCreate },
}))

vi.mock("@/components/BackButton", () => ({
  BackLink: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("@/components/PaginationWrapper", () => ({
  default: ({ totalPages }: { totalPages: number }) => (
    <div data-testid='pagination'>{totalPages}</div>
  ),
}))

vi.mock(
  "@/components/message-events/MessageStatus",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    MessageStatus: ({
      type,
      status,
      context,
    }: {
      type: string
      status: string
      context: string
    }) => <span data-context={context}>{`${type}:${status}`}</span>,
  }),
)

vi.mock("@/components/tables/TanStackTable", () => ({
  TanStackTable: ({
    table,
    emptyMessage,
    isLoading,
  }: {
    table: {
      getRowModel: () => {
        rows: Array<{
          id: string
          getVisibleCells: () => Array<{
            id: string
            column: { columnDef: { cell?: unknown } }
            getContext: () => unknown
            getValue: () => unknown
          }>
        }>
      }
    }
    emptyMessage?: string
    isLoading?: boolean
  }) => (
    <div data-testid='events-table'>
      {isLoading ? "loading" : null}
      {table.getRowModel().rows.length === 0 ? emptyMessage : null}
      {table.getRowModel().rows.map((row) => (
        <div key={row.id}>
          {row.getVisibleCells().map((cell) => (
            <span key={cell.id}>
              {cell.column.columnDef.cell
                ? flexRender(
                    cell.column.columnDef.cell as Parameters<
                      typeof flexRender
                    >[0],
                    cell.getContext() as Parameters<typeof flexRender>[1],
                  )
                : String(cell.getValue() ?? "")}
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of [...searchParamsMock.keys()]) {
    searchParamsMock.delete(key)
  }
  fetchMock.mockReturnValue({
    data: [],
    metadata: { totalCount: 0 },
    isLoading: false,
    error: null,
  })
})

describe(MessageEventsPageClient.name, () => {
  it("renders the heading, search controls, and event table", () => {
    render(<MessageEventsPageClient />)

    expect(
      screen.getByRole("heading", { name: "heading.mainEvents" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "button.search" }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("events-table")).toBeInTheDocument()
  })
})

describe(SearchBar.name, () => {
  it("hydrates filters from the URL and pushes changed search values", async () => {
    searchParamsMock.set("dateFrom", "2026-01-01")
    searchParamsMock.set("status", "delivered")
    searchParamsMock.set("search", "Ada")
    const user = userEvent.setup()

    render(<SearchBar />)

    expect(screen.getByLabelText("label.from")).toHaveValue("2026-01-01")
    expect(screen.getByLabelText("label.status")).toHaveValue("delivered")
    await user.clear(screen.getByLabelText("label.search"))
    await user.type(screen.getByLabelText("label.search"), "Grace")
    await user.click(screen.getByRole("button", { name: "button.search" }))

    expect(pushMock).toHaveBeenCalledWith(
      "?dateFrom=2026-01-01&status=delivered&search=Grace&dateTo=",
    )
  })

  it("clears every filter when reset is clicked", async () => {
    searchParamsMock.set("search", "Ada")
    const user = userEvent.setup()
    render(<SearchBar />)

    await user.click(screen.getByRole("button", { name: "button.reset" }))
    expect(pushMock).toHaveBeenCalledWith("?")
  })
})

describe(EventTable.name, () => {
  it("fetches with URL filters and renders pagination", () => {
    searchParamsMock.set("search", "Ada")
    searchParamsMock.set("page", "1")
    fetchMock.mockReturnValue({
      data: [
        {
          id: "event-1",
          eventType: "message_delivery",
          eventStatus: "successful",
          messageId: "message-1",
          subject: "Hello",
        },
      ],
      metadata: { totalCount: 25 },
      isLoading: false,
      error: null,
    })

    render(<EventTable />)

    expect(fetchMock.mock.calls[0]?.[0]).toContain("search=Ada")
    expect(fetchMock.mock.calls[0]?.[0]).toContain("offset=20")
    expect(screen.getByText("Hello")).toBeInTheDocument()
    expect(screen.getByTestId("pagination")).toHaveTextContent("2")
  })

  it("renders event dates, statuses, and detail links", () => {
    searchParamsMock.set("status", "not-a-status")
    searchParamsMock.set("size", "10")
    fetchMock.mockReturnValue({
      data: [
        {
          id: "event-1",
          eventType: "message_delivery",
          eventStatus: "successful",
          messageId: "message-1",
          scheduledAt: "2026-01-01T10:00:00.000Z",
          receiverFullName: "Ada",
          subject: "Hello",
        },
        {
          id: "event-2",
          eventType: "message_delivery",
          eventStatus: "failed",
          messageId: "message-2",
        },
      ],
      metadata: { totalCount: 2 },
      isLoading: false,
      error: null,
    })

    render(<EventTable />)

    expect(screen.getByText("message_delivery:successful")).toHaveAttribute(
      "data-context",
      "list",
    )
    expect(screen.getByText("n/a")).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: "link.view" })).toHaveLength(2)
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("status=")
    expect(screen.queryByTestId("pagination")).not.toBeInTheDocument()
  })

  it("reports fetch errors and hides pagination while loading", () => {
    fetchMock.mockReturnValue({
      data: [],
      metadata: { totalCount: 100 },
      isLoading: true,
      error: new Error("failed"),
    })

    render(<EventTable />)

    expect(toasterCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "toast.title.serverError" }),
    )
    expect(screen.getByTestId("events-table")).toHaveTextContent("loading")
    expect(screen.queryByTestId("pagination")).not.toBeInTheDocument()
  })
})

describe(MessageEventDetailClient.name, () => {
  it("renders nothing without an event id", () => {
    const { container } = render(<MessageEventDetailClient />)
    expect(fetchMock).toHaveBeenCalledWith(null)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders loading and loaded event states", () => {
    searchParamsMock.set("eventId", "event-1")
    fetchMock.mockReturnValueOnce({ data: undefined, isLoading: true })
    const { rerender } = render(<MessageEventDetailClient />)
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument()

    fetchMock.mockReturnValue({
      data: [
        {
          messageId: "message-1",
          id: "event-1",
          eventType: "message_delivery",
          eventStatus: "successful",
          createdAt: "2026-01-01T10:00:00.000Z",
          data: {},
        },
      ],
      isLoading: false,
    })
    rerender(<MessageEventDetailClient />)

    expect(
      screen.getByRole("heading", { name: "heading.mainEvent" }),
    ).toBeInTheDocument()
    expect(screen.getByText("message_delivery:successful")).toHaveAttribute(
      "data-context",
      "timeline",
    )
    expect(screen.getByRole("link", { name: "link.back" })).toHaveAttribute(
      "href",
      "/en/message-events",
    )
  })
})
