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
  useLocale: () => "en",
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
  MessagesDataTableHeader: () => <div>search header</div>,
}))
vi.mock("./submission-list-table", () => ({
  SubmissionListTable: ({
    onSelect,
    onPageSizeChange,
  }: {
    onSelect: (id: string) => void
    onPageSizeChange: (size: number) => void
  }) => (
    <>
      <button type='button' onClick={() => onSelect("submission-1")}>
        open submission
      </button>
      <button type='button' onClick={() => onPageSizeChange(20)}>
        show 20
      </button>
    </>
  ),
}))
vi.mock("@ogcio/design-system-react", () => ({
  Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
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

  it("opens the selected submission", () => {
    render(<SubmissionListView />)
    fireEvent.click(screen.getByRole("button", { name: "open submission" }))
    expect(mockPush).toHaveBeenCalledWith("/en/my-submissions?id=submission-1")
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
