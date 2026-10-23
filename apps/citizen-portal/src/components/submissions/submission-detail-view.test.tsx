import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  result: {
    submission: undefined as
      | {
          id: string
          title: { en: string }
          description: { en: string }
          organizationId: string
          status: "completed"
          createdAt: string
          updatedAt: string
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
const organisation = vi.hoisted(() => ({
  path: null as string | null,
  isLoading: false,
  data: undefined as
    | { translations: { en: { name: string }; ga: { name: string } } }
    | undefined,
}))
vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayFetch: (path: string | null) => {
    organisation.path = path
    return { data: organisation.data, isLoading: organisation.isLoading }
  },
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
    organisation.path = null
    organisation.isLoading = false
    organisation.data = {
      translations: {
        en: { name: "Department of Education" },
        ga: { name: "An Roinn Oideachais" },
      },
    }
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

  const SUBMISSION = {
    id: "38BB94E3",
    title: { en: "Apply for a school place" },
    description: { en: "Applied for a primary school place." },
    organizationId: "doe",
    status: "completed" as const,
    createdAt: "2026-04-10T09:00:00Z",
    updatedAt: "2026-04-18T09:00:00Z",
    submittedAt: "2026-04-17T09:00:00Z",
  }

  it("titles the page with the application, its organisation and description", () => {
    state.result.submission = SUBMISSION
    const { container } = render(<SubmissionDetailView id='38BB94E3' />)
    expect(container.firstElementChild).toHaveClass(messageStyles.detailOffset)
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Apply for a school place",
      }),
    ).toHaveClass(pageTitleStyles.pageTitle)
    expect(organisation.path).toContain("/organisations/doe")
    expect(screen.getByText("Department of Education")).toBeInTheDocument()
    expect(
      screen.getByText("Applied for a primary school place."),
    ).toBeInTheDocument()
    expect(
      screen.getByText("related:38BB94E3:Apply for a school place"),
    ).toBeInTheDocument()
  })

  it("lists status, last update, submitted date and submission ID", () => {
    state.result.submission = SUBMISSION
    render(<SubmissionDetailView id='38BB94E3' />)
    const terms = screen.getAllByRole("term").map((term) => term.textContent)
    expect(terms).toEqual([
      "applicationStatus",
      "lastUpdate",
      "submittedDate",
      "id",
    ])
    const values = screen
      .getAllByRole("definition")
      .map((value) => value.textContent)
    expect(values).toEqual([
      "completed",
      "18/04/2026",
      "17/04/2026",
      "38BB94E3",
    ])
  })

  it("omits the submitted date when the application has not been submitted", () => {
    state.result.submission = { ...SUBMISSION, submittedAt: undefined }
    render(<SubmissionDetailView id='38BB94E3' />)
    expect(screen.queryByText("submittedDate")).not.toBeInTheDocument()
  })

  it("keeps the organisation line while its name loads", () => {
    organisation.isLoading = true
    organisation.data = undefined
    state.result.submission = SUBMISSION
    render(<SubmissionDetailView id='38BB94E3' />)
    expect(screen.getByTestId("organisation-skeleton")).toBeInTheDocument()
    expect(
      screen.queryByText("Department of Education"),
    ).not.toBeInTheDocument()
  })

  it("leaves out the organisation when profile cannot name it", () => {
    organisation.data = undefined
    state.result.submission = SUBMISSION
    render(<SubmissionDetailView id='38BB94E3' />)
    expect(
      screen.queryByText("Department of Education"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Apply for a school place",
      }),
    ).toBeInTheDocument()
  })
})
