import { render, screen, within } from "@testing-library/react"
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
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, string>) => {
      const byNamespace: Record<string, Record<string, string>> = {
        submissions: {
          loading: "Loading applications",
          "noResults.title": "No applications match your search",
          "noResults.description": "Check the spelling or try different words.",
          "noResults.clear": "Clear search",
        },
        "submissions.table": {
          "column.title": "Title",
          "column.status": "Status",
          "column.date": "Last update",
          "column.id": "Submission ID",
          idLabel: "ID {id}",
          lastUpdate: "Last update {date}",
          "aria.submissionList": "Application list",
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
      const message = byNamespace[namespace]?.[key] ?? key
      return message.replace(/\{(\w+)\}/g, (_, name) => values?.[name] ?? "")
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
  const onPageSizeChange = vi.fn()

  beforeEach(() => {
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
      />,
    )

    const table = screen.getByTestId("submissions-table")
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Title", "Status", "Last update", "Submission ID"])
    expect(table).toHaveTextContent("SCH-2025-073296")
    expect(
      within(table).getByRole("link", { name: "Birth registration" }),
    ).toHaveAttribute("href", "/en/my-submissions?id=SCH-2025-073296")
    expect(table).toHaveTextContent("Completed")
    expect(within(table).getByText("18/01/2026")).toHaveAttribute(
      "datetime",
      SUBMISSION.updatedAt,
    )
  })

  it("renders a mobile card per submission with ID, status, link and last update", () => {
    render(
      <SubmissionListTable
        submissions={[SUBMISSION]}
        isLoading={false}
        totalPages={1}
        pageSize={10}
        onPageSizeChange={onPageSizeChange}
      />,
    )

    const list = screen.getByRole("list", { name: "Application list" })
    const item = within(list).getByRole("listitem")
    expect(item).toHaveTextContent("ID SCH-2025-073296")
    expect(item).toHaveTextContent("Completed")
    expect(
      within(item).getByRole("link", { name: "Birth registration" }),
    ).toHaveAttribute("href", "/en/my-submissions?id=SCH-2025-073296")
    expect(item).toHaveTextContent("Last update 18/01/2026")
  })

  it("shows skeleton rows under the table header while loading", () => {
    render(
      <SubmissionListTable
        submissions={[]}
        isLoading
        totalPages={0}
        pageSize={10}
        onPageSizeChange={onPageSizeChange}
      />,
    )

    expect(screen.getByText("Loading applications")).toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: "Title" }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByTestId("submission-skeleton-row").length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByTestId("submission-skeleton-card").length,
    ).toBeGreaterThan(0)
  })

  it("shows no-results copy with a Clear search link when a search matches nothing", () => {
    currentSearchParams = new URLSearchParams("search=passport&page=2&limit=20")
    render(
      <SubmissionListTable
        submissions={[]}
        isLoading={false}
        totalPages={0}
        pageSize={20}
        onPageSizeChange={onPageSizeChange}
      />,
    )

    expect(
      screen.getByRole("heading", {
        name: "No applications match your search",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Check the spelling or try different words."),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute(
      "href",
      "/en/my-submissions?limit=20",
    )
  })
})
