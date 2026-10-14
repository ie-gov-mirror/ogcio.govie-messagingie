import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPush = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  hookArgs: undefined as unknown,
  result: {
    submissions: [] as Array<{
      id: string
      title: { en: string }
      createdAt: string
      submittedAt?: string
    }>,
    isLoading: false,
    error: null as Error | null,
  },
}))

vi.mock("@ogcio/sag-client/react", () => ({
  useAuth: () => ({ user: { sub: "user-1" }, loading: false }),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { message?: string }) =>
    values?.message ? `${key}:${values.message}` : key,
}))
vi.mock("@/hooks/use-idle-mount", () => ({ useIdleMount: () => true }))
vi.mock("@/components/submissions/use-submissions", () => ({
  useSubmissionsList: (args: unknown) => {
    state.hookArgs = args
    return state.result
  },
}))
vi.mock("./dashboard-panel", () => ({
  DashboardPanel: ({
    title,
    cta,
    children,
  }: {
    title: string
    cta: React.ReactNode
    children: React.ReactNode
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
      {cta}
    </section>
  ),
}))
vi.mock("@/components/list-card/list-card", () => ({
  ListCard: ({
    title,
    onClick,
  }: {
    title: React.ReactNode
    onClick: () => void
  }) => (
    <button type='button' onClick={onClick}>
      {title}
    </button>
  ),
}))
vi.mock("@ogcio/design-system-react", () => ({
  FormField: ({ error }: { error: { text: string } }) => <p>{error.text}</p>,
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))

import { MyApplications } from "./my-applications"

describe("MyApplications", () => {
  beforeEach(() => {
    mockPush.mockReset()
    state.result = { submissions: [], isLoading: false, error: null }
  })

  it("requests the minimum valid page and links to the applications list", () => {
    render(<MyApplications />)
    expect(state.hookArgs).toMatchObject({
      page: 1,
      pageSize: 5,
      enabled: true,
    })
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "/en/my-submissions",
    )
    expect(screen.getByText("empty")).toBeInTheDocument()
  })

  it("shows at most three recent applications and opens the selected one", () => {
    state.result.submissions = Array.from({ length: 5 }, (_, index) => ({
      id: `submission-${index + 1}`,
      title: { en: `Application ${index + 1}` },
      createdAt: "2026-01-01T00:00:00Z",
    }))
    render(<MyApplications />)
    expect(screen.getAllByRole("button")).toHaveLength(3)
    fireEvent.click(screen.getByRole("button", { name: "submission-2" }))
    expect(mockPush).toHaveBeenCalledWith("/en/my-submissions?id=submission-2")
  })

  it("surfaces fetch errors without hiding the empty state", () => {
    state.result.error = new Error("journey unavailable")
    render(<MyApplications />)
    expect(screen.getByText("error:journey unavailable")).toBeInTheDocument()
    expect(screen.getByText("empty")).toBeInTheDocument()
  })
})
