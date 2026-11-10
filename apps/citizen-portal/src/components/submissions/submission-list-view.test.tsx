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

import { fakeAnalytics } from "../../../test/utils/analytics"
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

  it("renders the page heading without a subtitle, and the search placeholder", () => {
    render(<SubmissionListView />)
    expect(
      screen.getByRole("heading", { level: 1, name: "heading" }),
    ).toBeInTheDocument()
    expect(screen.queryByText("description")).not.toBeInTheDocument()
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

describe("SubmissionListView analytics", () => {
  const searched = (value: number) => ({
    event: {
      name: "submissions-searched",
      category: "Search",
      action: "Submissions Searched",
      value,
    },
  })

  /** Search events only; the list view event is covered on its own. */
  const searches = (analytics: ReturnType<typeof fakeAnalytics>) =>
    analytics.event.mock.calls.filter(
      ([call]) => call.event.category === "Search",
    )

  beforeEach(() => {
    state.params = new URLSearchParams("search=grant")
    state.result = {
      submissions: [],
      totalCount: 0,
      isLoading: true,
      error: null,
    }
  })

  it("reports a committed search once its results have loaded", () => {
    const analytics = fakeAnalytics()
    const { rerender } = analytics.render(<SubmissionListView />)
    expect(searches(analytics)).toEqual([])

    state.result = { ...state.result, isLoading: false, totalCount: 4 }
    rerender(<SubmissionListView />)
    rerender(<SubmissionListView />)

    expect(searches(analytics)).toEqual([[searched(4)]])
    expect(JSON.stringify(analytics.event.mock.calls)).not.toContain("grant")
  })

  it("reports each new search, but not a page change on the same search", () => {
    state.result = { ...state.result, isLoading: false, totalCount: 2 }
    const analytics = fakeAnalytics()
    const { rerender } = analytics.render(<SubmissionListView />)

    state.params = new URLSearchParams("search=grant&page=2")
    rerender(<SubmissionListView />)
    state.params = new URLSearchParams("search=housing")
    rerender(<SubmissionListView />)

    expect(searches(analytics)).toEqual([[searched(2)], [searched(2)]])
  })

  it("reports nothing when the search is cleared", () => {
    state.params = new URLSearchParams()
    state.result = { ...state.result, isLoading: false }
    const analytics = fakeAnalytics()
    analytics.render(<SubmissionListView />)

    expect(searches(analytics)).toEqual([])
  })

  it("reports the list view once", () => {
    state.params = new URLSearchParams()
    const analytics = fakeAnalytics()
    const { rerender } = analytics.render(<SubmissionListView />)
    rerender(<SubmissionListView />)

    expect(analytics.event.mock.calls).toEqual([
      [
        {
          event: {
            category: "Application",
            name: "application-list-view",
            action: "Applications List Viewed",
          },
        },
      ],
    ])
  })
})
