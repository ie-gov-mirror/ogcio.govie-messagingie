import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  result: {
    submission: undefined as
      | {
          id: string
          title: { en: string }
          description: { en: string }
          status: "completed"
          createdAt: string
          submittedAt?: string
        }
      | undefined,
    isLoading: false,
    error: null as Error | null,
  },
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/my-submissions",
}))
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))
vi.mock("./use-submissions", () => ({
  useSubmission: () => state.result,
}))
vi.mock("@ogcio/design-system-react", () => ({
  Heading: ({
    as: Tag = "h1",
    className,
    children,
  }: {
    as?: "h1" | "h2"
    className?: string
    children: React.ReactNode
  }) => <Tag className={className}>{children}</Tag>,
  Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))
vi.mock("./submission-detail-toolbar", () => ({
  SubmissionDetailToolbar: ({ backHref }: { backHref: string }) => (
    <a href={backHref}>Back</a>
  ),
}))
vi.mock("./submission-status-tag", () => ({
  SubmissionStatusTag: ({ status }: { status: string }) => (
    <span>{status}</span>
  ),
}))
vi.mock("./submission-related-messages", () => ({
  SubmissionRelatedMessages: ({
    submissionId,
    submissionTitle,
  }: {
    submissionId: string
    submissionTitle: string
  }) => <div>{`related:${submissionId}:${submissionTitle}`}</div>,
}))

import messageStyles from "@/components/messages/message-detail.module.css"
import pageTitleStyles from "@/components/page-title.module.css"
import { SubmissionDetailView } from "./submission-detail-view"

describe("SubmissionDetailView", () => {
  beforeEach(() => {
    state.result = { submission: undefined, isLoading: false, error: null }
  })

  it("announces loading while the submission is fetched", () => {
    state.result.isLoading = true
    render(<SubmissionDetailView id='submission-1' />)
    expect(screen.getByLabelText("loading")).toBeInTheDocument()
  })

  it("shows the error and a route back to the list", () => {
    state.result.error = new Error("Submission unavailable")
    const { container } = render(<SubmissionDetailView id='submission-1' />)
    expect(container.firstElementChild).toHaveClass(messageStyles.detailOffset)
    expect(screen.getByText("Submission unavailable")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/en/my-submissions",
    )
  })

  it("renders the localized submission fields and related messages", () => {
    state.result.submission = {
      id: "submission-1",
      title: { en: "Housing support" },
      description: { en: "Apply for support" },
      status: "completed",
      createdAt: "2026-01-01T00:00:00Z",
      submittedAt: "2026-01-02T00:00:00Z",
    }
    const { container } = render(<SubmissionDetailView id='submission-1' />)
    expect(container.firstElementChild).toHaveClass(messageStyles.detailOffset)
    expect(screen.getByRole("heading", { name: "heading" })).toHaveClass(
      pageTitleStyles.pageTitle,
    )
    expect(screen.getByText("Housing support")).toBeInTheDocument()
    expect(screen.getByText("Apply for support")).toBeInTheDocument()
    expect(
      screen.getByText("related:submission-1:Housing support"),
    ).toBeInTheDocument()
    expect(screen.getByText("submittedDate")).toBeInTheDocument()
  })
})
