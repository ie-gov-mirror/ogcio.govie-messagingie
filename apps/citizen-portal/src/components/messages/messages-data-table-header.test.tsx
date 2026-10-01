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
  InboxListSearchField: ({ searchInputTestId }: { searchInputTestId: string }) => (
    <input data-testid={searchInputTestId} />
  ),
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
  DataTableHeaderFilterList: () => null,
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
  Popover: ({
    children,
    open,
  }: React.PropsWithChildren<{ open: boolean }>) => (open ? <div>{children}</div> : null),
}))

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

  it("applies a status filter while preserving search and resetting page", () => {
    searchParams = new URLSearchParams("search=tax&page=3")
    render(<MessagesDataTableHeader />)

    fireEvent.click(screen.getByTestId("status-filter"))
    fireEvent.click(screen.getByRole("radio", { name: "read" }))
    fireEvent.click(screen.getByRole("button", { name: "apply" }))

    expect(push).toHaveBeenCalledWith("/en/messages?search=tax&status=read")
  })
})
