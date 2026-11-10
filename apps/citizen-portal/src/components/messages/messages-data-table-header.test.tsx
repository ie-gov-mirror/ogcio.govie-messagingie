import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const push = vi.fn()
let searchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/messages",
  useRouter: () => ({ push }),
}))

vi.mock("@/hooks/use-url-search-params", () => ({
  useUrlSearchParams: () => searchParams,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("./inbox-list-search-field", () => ({
  InboxListSearchField: ({
    searchInputTestId,
    ariaLabel,
  }: {
    searchInputTestId: string
    ariaLabel?: string
  }) => <input data-testid={searchInputTestId} aria-label={ariaLabel} />,
}))

vi.mock("@ogcio/design-system-react", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  DataTableHeader: ({
    children,
    showFilter,
  }: React.PropsWithChildren<{ showFilter: boolean }>) => (
    <header data-show-filter={showFilter}>{children}</header>
  ),
  DataTableHeaderSearch: ({
    children,
    className,
  }: React.PropsWithChildren<{ className?: string }>) => (
    <div data-testid='search-slot' className={className}>
      {children}
    </div>
  ),
  DataTableHeaderFilter: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DataTableHeaderFilterActions: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DataTableHeaderFilterContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DataTableHeaderFilterContentTitle: ({
    children,
  }: React.PropsWithChildren) => <h2>{children}</h2>,
  DataTableHeaderFilterList: ({
    filters,
    onRemove,
  }: {
    filters: { id: string; label: string }[]
    onRemove: (id: string) => void
  }) => (
    <div>
      {filters.map((filter) => (
        <button
          type='button'
          key={filter.id}
          onClick={() => onRemove(filter.id)}
        >
          {`remove ${filter.label}`}
        </button>
      ))}
    </div>
  ),
  InputRadioGroup: ({
    children,
    onChange,
  }: React.PropsWithChildren<{
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  }>) => <div onChange={onChange}>{children}</div>,
  InputRadio: ({
    id,
    label,
    value,
  }: {
    id: string
    label: string
    value: string
  }) => (
    <label htmlFor={id}>
      <input id={id} type='radio' value={value} name='status' />
      {label}
    </label>
  ),
  Popover: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div>{children}</div> : null,
  Icon: () => <span aria-hidden='true' />,
}))

import { fakeAnalytics } from "../../../test/utils/analytics"
import { MessagesDataTableHeader } from "./messages-data-table-header"
import styles from "./messages-data-table-header.module.css"

describe("MessagesDataTableHeader", () => {
  beforeEach(() => {
    push.mockClear()
    searchParams = new URLSearchParams()
  })

  it("supports search-only chrome without rendering filters", () => {
    render(
      <MessagesDataTableHeader
        enableFilters={false}
        searchInputTestId='custom-search'
      />,
    )

    expect(screen.getByTestId("custom-search")).toBeInTheDocument()
    expect(screen.queryByTestId("status-filter")).not.toBeInTheDocument()
    expect(screen.getByTestId("search-slot")).not.toHaveClass(
      styles.searchBesideFilters,
    )
  })

  it("keeps the search slot from growing so Filters sits beside it", () => {
    render(<MessagesDataTableHeader />)

    expect(screen.getByTestId("search-slot")).toHaveClass(
      styles.searchBesideFilters,
    )
    expect(screen.getByTestId("status-filter")).toBeInTheDocument()
  })

  it("labels search and exposes the Filters button state", () => {
    render(<MessagesDataTableHeader />)

    expect(screen.getByTestId("search-input")).toHaveAttribute(
      "aria-label",
      "ariaLabel",
    )
    const filters = screen.getByRole("button", { name: "button" })
    expect(filters).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByTestId("filter-icon")).toHaveClass(styles.filterIcon)
    expect(screen.getByTestId("filter-label")).toHaveClass(styles.filterLabel)
  })

  it("applies a status filter while preserving search and resetting page", () => {
    searchParams = new URLSearchParams("search=tax&page=3")
    render(<MessagesDataTableHeader />)

    fireEvent.click(screen.getByTestId("status-filter"))
    fireEvent.click(screen.getByRole("radio", { name: "read" }))
    fireEvent.click(screen.getByRole("button", { name: "apply" }))

    expect(push).toHaveBeenCalledWith("/en/messages?search=tax&status=read")
  })
})

describe("MessagesDataTableHeader analytics", () => {
  const filterApplied = {
    event: {
      name: "message-filter",
      category: "Message",
      action: "Filter Applied",
    },
  }

  function applyStatus(status: "read" | "unread") {
    fireEvent.click(screen.getByTestId("status-filter"))
    fireEvent.click(screen.getByRole("radio", { name: status }))
    fireEvent.click(screen.getByRole("button", { name: "apply" }))
  }

  beforeEach(() => {
    searchParams = new URLSearchParams()
  })

  it("tracks applying a read-status filter", () => {
    const analytics = fakeAnalytics()
    analytics.render(<MessagesDataTableHeader />)

    applyStatus("unread")

    expect(analytics.event).toHaveBeenCalledTimes(1)
    expect(analytics.event).toHaveBeenCalledWith(filterApplied)
  })

  it("sends nothing when the applied status is already active", () => {
    searchParams = new URLSearchParams("status=read")
    const analytics = fakeAnalytics()
    analytics.render(<MessagesDataTableHeader />)

    applyStatus("read")

    expect(analytics.event).not.toHaveBeenCalled()
  })

  it("sends nothing when the filter chip is removed", () => {
    searchParams = new URLSearchParams("status=unread")
    const analytics = fakeAnalytics()
    analytics.render(<MessagesDataTableHeader />)

    fireEvent.click(screen.getByRole("button", { name: "remove unread" }))

    expect(push).toHaveBeenCalledWith("/en/messages")
    expect(analytics.event).not.toHaveBeenCalled()
  })

  it("sends nothing when the filter is cleared", () => {
    searchParams = new URLSearchParams("status=read")
    const analytics = fakeAnalytics()
    analytics.render(<MessagesDataTableHeader />)

    fireEvent.click(screen.getByTestId("status-filter"))
    fireEvent.click(screen.getByRole("button", { name: "clear" }))

    expect(push).toHaveBeenCalledWith("/en/messages")
    expect(analytics.event).not.toHaveBeenCalled()
  })
})
