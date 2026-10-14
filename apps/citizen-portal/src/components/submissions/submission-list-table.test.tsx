import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SubmissionListTable } from "@/components/submissions/submission-list-table"
import type { Submission } from "@/types"

const mockPush = vi.fn()
let currentSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => currentSearchParams,
  usePathname: () => "/en/my-submissions",
}))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace: string) => (key: string) => {
    const byNamespace: Record<string, Record<string, string>> = {
      submissions: {
        "empty.all": "You have no submissions yet.",
        "empty.search": "No submissions match your search.",
      },
      "submissions.table": {
        "column.id": "ID",
        "column.submission": "Submission",
        "column.status": "Status",
        "column.date": "Date",
        "aria.submissionList": "Submission list",
      },
      "submissions.status": {
        completed: "Completed",
      },
      "home.table": {
        rowsPerPage: "Rows per page",
      },
      search: {
        "input.placeholder": "Search",
      },
    }
    return byNamespace[namespace]?.[key] ?? key
  },
}))

const SUBMISSION: Submission = {
  id: "SCH-2025-073296",
  title: { en: "Birth registration" },
  description: { en: "Register a birth" },
  organizationId: "org-gro",
  journeyId: "journey-1",
  status: "completed",
  createdAt: "2026-01-10T09:00:00Z",
  updatedAt: "2026-01-18T16:20:00Z",
  submittedAt: "2026-01-12T10:00:00Z",
}

describe("SubmissionListTable", () => {
  const onSelect = vi.fn()
  const onPageSizeChange = vi.fn()

  beforeEach(() => {
    onSelect.mockReset()
    onPageSizeChange.mockReset()
    currentSearchParams = new URLSearchParams()
  })

  it("renders the desktop data table with submission rows", () => {
    render(
      <SubmissionListTable
        submissions={[SUBMISSION]}
        isLoading={false}
        totalPages={1}
        pageSize={10}
        onPageSizeChange={onPageSizeChange}
        onSelect={onSelect}
      />,
    )

    const table = screen.getByTestId("submissions-table")
    expect(table).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "ID" })).toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: "Submission" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: "Status" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: "Date" }),
    ).toBeInTheDocument()
    expect(table).toHaveTextContent("SCH-2025-073296")
    expect(
      screen.getByRole("link", { name: "Birth registration" }),
    ).toHaveAttribute("href", "/en/my-submissions?id=SCH-2025-073296")
    expect(table).toHaveTextContent("Completed")
  })

  it("renders the empty state when there are no submissions", () => {
    render(
      <SubmissionListTable
        submissions={[]}
        isLoading={false}
        totalPages={0}
        pageSize={10}
        onPageSizeChange={onPageSizeChange}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByText("You have no submissions yet.")).toBeInTheDocument()
  })
})
