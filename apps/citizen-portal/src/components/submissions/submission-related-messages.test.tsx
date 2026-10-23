import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const gateway = vi.hoisted(() => ({
  path: "",
  state: {
    data: [] as Array<Record<string, unknown>>,
    isLoading: false,
    error: null as Error | null,
  },
}))

vi.mock("@citizen-portal/shared", () => ({
  useCrossZoneLink: () => (_zone: string, path: string) =>
    `https://messages.example${path}`,
}))
vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayFetch: (path: string) => {
    gateway.path = path
    return gateway.state
  },
}))
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))
vi.mock("@ogcio/design-system-react", async () => {
  const actual = await vi.importActual<
    typeof import("@ogcio/design-system-react")
  >("@ogcio/design-system-react")
  return {
    Heading: actual.Heading,
    Paragraph: ({ children }: { children: React.ReactNode }) => (
      <p>{children}</p>
    ),
    Alert: ({ title, variant }: { title: string; variant: string }) => (
      <div role='alert' data-variant={variant}>
        {title}
      </div>
    ),
  }
})
vi.mock("@/components/messages/unified-inbox-table", () => ({
  UnifiedInboxTable: ({
    messages,
    buildDetailHref,
  }: {
    messages: Array<{ id: string }>
    buildDetailHref: (id: string) => string
  }) => <a href={buildDetailHref(messages[0].id)}>desktop:{messages[0].id}</a>,
}))
vi.mock("@/components/messages/sender-name", () => ({
  SenderName: () => <span>Sender</span>,
}))
vi.mock("@/components/list-card/list-card", () => ({
  ListCard: ({ preview }: { preview: React.ReactNode }) => (
    <button type='button'>{preview}</button>
  ),
}))

import { SubmissionRelatedMessages } from "./submission-related-messages"

describe("SubmissionRelatedMessages", () => {
  beforeEach(() => {
    gateway.state = { data: [], isLoading: false, error: null }
  })

  it("requests messages for the submission and shows the empty state", () => {
    render(
      <SubmissionRelatedMessages
        submissionId='submission 1'
        submissionTitle='Housing support'
      />,
    )
    expect(gateway.path).toBe(
      "/messaging-public-api/api/v1/citizens/messages?submissionId=submission+1&limit=50&offset=0",
    )
    const empty = screen.getByRole("alert")
    expect(empty).toHaveTextContent("submissions.detail.related.empty")
    expect(empty).toHaveAttribute("data-variant", "info")
    const heading = screen.getByRole("heading", {
      name: "submissions.detail.related.title",
    })
    expect(heading).toHaveClass("gi-text-lg", "xl:gi-text-xl")
    expect(heading.className).not.toContain("xl:gi-text-2xl")
  })

  it("exposes an accessible loading status", () => {
    gateway.state = { data: [], isLoading: true, error: null }
    render(
      <SubmissionRelatedMessages
        submissionId='submission-1'
        submissionTitle='Housing support'
      />,
    )
    expect(
      screen.getByLabelText("submissions.detail.loading"),
    ).toBeInTheDocument()
  })

  it("links related messages back to the messages zone with context", () => {
    gateway.state = {
      data: [
        {
          id: "message-1",
          subject: "Application received",
          createdAt: "2026-01-01T00:00:00Z",
          organisationId: "org-1",
          attachmentsCount: 0,
          isSeen: true,
        },
      ],
      isLoading: false,
      error: null,
    }
    render(
      <SubmissionRelatedMessages
        submissionId='submission-1'
        submissionTitle='Housing support'
      />,
    )
    expect(
      screen.getByRole("link", { name: "desktop:message-1" }),
    ).toHaveAttribute(
      "href",
      "https://messages.example/en/messages?id=message-1&submissionId=submission-1&submissionTitle=Housing+support",
    )
  })
})
