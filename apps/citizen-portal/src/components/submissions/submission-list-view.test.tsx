import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPush = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  params: new URLSearchParams(),
  result: {
    submissions: [] as Array<{ id: string }>,
    totalCount: 0,
    isLoading: false,
    error: null as Error | null,
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/en/my-submissions",
}))
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { message?: string }) =>
    values?.message ? `${key}:${values.message}` : key,
}))
vi.mock("@/hooks/use-url-search-params", () => ({
  useUrlSearchParams: () => state.params,
}))
vi.mock("./use-submissions", () => ({
  useSubmissionsList: () => state.result,
}))
vi.mock("@/components/messages/inbox-list-chrome-header", () => ({
  InboxListChromeHeader: ({
    searchChrome,
  }: {
    searchChrome: React.ReactNode
  }) => <div>{searchChrome}</div>,
}))
vi.mock("@/components/messages/messages-data-table-header", () => ({
  MessagesDataTableHeader: ({
    searchPlaceholder,
  }: {
    searchPlaceholder?: string
  }) => <div>search header:{searchPlaceholder}</div>,
}))
vi.mock("./submission-list-table", () => ({
  SubmissionListTable: ({
    onPageSizeChange,
  }: {
    onPageSizeChange: (size: number) => void
  }) => (
    <button type='button' onClick={() => onPageSizeChange(20)}>
      show 20
    </button>
  ),
}))
vi.mock("@ogcio/design-system-react", () => ({
  Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Heading: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  Alert: ({
    title,
    children,
  }: {
    title: string
    children: React.ReactNode
  }) => (
    <div role='alert'>
      {title}
      {children}
    </div>
  ),
}))

import { SubmissionListView } from "./submission-list-view"

describe("SubmissionListView", () => {
  beforeEach(() => {
    mockPush.mockReset()
    state.params = new URLSearchParams("search=grant&page=3")
    state.result = {
      submissions: [],
      totalCount: 0,
      isLoading: false,
      error: null,
    }
  })

  it("renders the page heading, description and search placeholder", () => {
    render(<SubmissionListView />)
    expect(
      screen.getByRole("heading", { level: 1, name: "heading" }),
    ).toBeInTheDocument()
    expect(screen.getByText("description")).toBeInTheDocument()
    expect(
      screen.getByText("search header:search.placeholder"),
    ).toBeInTheDocument()
  })

  it("replaces search and table with a banner when there are no applications", () => {
    state.params = new URLSearchParams()
    render(<SubmissionListView />)
    expect(screen.getByRole("alert")).toHaveTextContent(
      "empty.titleempty.description",
    )
    expect(screen.queryByText(/search header/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "show 20" }),
    ).not.toBeInTheDocument()
  })

  it("keeps the banner while an empty list revalidates", () => {
    state.params = new URLSearchParams()
    const { rerender } = render(<SubmissionListView />)
    state.result = { ...state.result, isLoading: true }
    rerender(<SubmissionListView />)
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it("keeps the list chrome when a search matches nothing", () => {
    render(<SubmissionListView />)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByText(/search header/)).toBeInTheDocument()
  })

  it("does not claim there are no applications when the fetch failed", () => {
    state.params = new URLSearchParams()
    state.result.error = new Error("service unavailable")
    render(<SubmissionListView />)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByText("error:service unavailable")).toBeInTheDocument()
  })

  it("changes the page size while preserving filters and resetting the page", () => {
    render(<SubmissionListView />)
    fireEvent.click(screen.getByRole("button", { name: "show 20" }))
    expect(mockPush).toHaveBeenCalledWith(
      "/en/my-submissions?search=grant&limit=20",
    )
  })

  it("shows a non-loading fetch error", () => {
    state.result.error = new Error("service unavailable")
    render(<SubmissionListView />)
    expect(screen.getByText("error:service unavailable")).toBeInTheDocument()
  })
})
